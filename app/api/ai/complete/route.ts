import { openai, AI_MODEL } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { context, documentText } = await req.json()

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an inline writing assistant. Given the text before the cursor, continue writing 1-2 sentences in exactly the same style, voice, and topic as the document. Reply with ONLY the continuation — no explanation, no quotes. Keep it under 40 words. If the context is unclear or too short, return an empty string.`,
        },
        {
          role: 'user',
          content: `Full document:\n${documentText?.slice(0, 1200) ?? ''}\n\nText before cursor — continue from here:\n${context}`,
        },
      ],
      max_tokens: 80,
      temperature: 0.6,
    })

    const completion = response.choices[0]?.message?.content?.trim() ?? ''
    return NextResponse.json({ completion })
  } catch {
    return NextResponse.json({ completion: '' })
  }
}
