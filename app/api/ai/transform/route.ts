import { openai, AI_MODEL } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const PROMPTS: Record<string, string> = {
  improve:
    'Rewrite the text to be clearer, more engaging, and more professional. Preserve the original meaning and approximate length. Output only the rewritten text, nothing else.',
  shorten:
    'Shorten this text to roughly half its length while keeping all key points. Output only the shortened text, nothing else.',
  expand:
    'Expand this text with more detail, vivid examples, and depth — roughly double the length. Output only the expanded text, nothing else.',
  fix:
    'Fix all spelling, grammar, and punctuation errors in the text. Preserve the original voice, style, and meaning exactly. Output only the corrected text, nothing else.',
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { action, text, context } = await req.json()
  if (!PROMPTS[action] || !text?.trim()) return new Response('Bad request', { status: 400 })

  const systemMsg = context
    ? `${PROMPTS[action]}\n\nDocument context (for matching tone/style only — do not summarise it):\n${context}`
    : PROMPTS[action]

  const stream = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: text },
    ],
    stream: true,
    max_tokens: 1200,
    temperature: 0.65,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`))
        }
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
