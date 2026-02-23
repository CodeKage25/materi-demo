import { openai, AI_MODEL, AGENT_TOOLS, buildAgentSystemPrompt } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { messages, documentId, documentTitle, documentText, collaborators } = await req.json()

  if (!messages || !documentId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [{ data: doc }, { data: profile }] = await Promise.all([
    supabase.from('documents').select('id').eq('id', documentId).single(),
    supabase.from('profiles').select('full_name').eq('user_id', user.id).single(),
  ])

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const callerName = profile?.full_name ?? user.email ?? 'Unknown user'
  const systemPrompt = buildAgentSystemPrompt(
    documentTitle,
    documentText,
    callerName,
    Array.isArray(collaborators) ? collaborators : [],
  )

  const stream = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    tools: AGENT_TOOLS,
    tool_choice: 'auto',
    stream: true,
    max_tokens: 2000,
  })

  const encoder = new TextEncoder()
  const readableStream = new ReadableStream({
    async start(controller) {
      let fullContent = ''
      let toolCallName = ''
      let toolCallArgs = ''
      let isToolCall = false

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta

        if (delta?.content) {
          fullContent += delta.content
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text', delta: delta.content })}\n\n`)
          )
        }

        if (delta?.tool_calls?.[0]) {
          isToolCall = true
          const tc = delta.tool_calls[0]
          if (tc.function?.name) toolCallName += tc.function.name
          if (tc.function?.arguments) toolCallArgs += tc.function.arguments
        }
      }

      if (isToolCall && toolCallName) {
        try {
          const args = JSON.parse(toolCallArgs)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'tool_call', name: toolCallName, args })}\n\n`)
          )
          fullContent = `[Applied: ${toolCallName.replace(/_/g, ' ')}]`
        } catch {
          fullContent = '[Tool call failed to parse]'
        }
      }

      if (fullContent) {
        await supabase.from('document_ai_messages').insert({
          document_id: documentId,
          user_id: user.id,
          role: 'assistant',
          content: fullContent,
        })
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
