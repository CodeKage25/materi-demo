'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Bot, User, Wand2, FileEdit, FilePlus } from 'lucide-react'

type Message = {
  id?: string
  role: string
  content: string
  fromName?: string
}

type ToolCall = {
  name: 'replace_document' | 'append_to_document' | 'suggest_edit'
  args: Record<string, string>
}

const TOOL_ICONS = {
  replace_document: FileEdit,
  append_to_document: FilePlus,
  suggest_edit: Wand2,
}

const TOOL_LABELS = {
  replace_document: 'Rewrote document',
  append_to_document: 'Added to document',
  suggest_edit: 'Applied edit',
}

function normContent(content: string): string {
  const m = content.match(/^\[Applied: (.+)\]$/)
  if (!m) return content
  const key = m[1].replace(/ /g, '_') as keyof typeof TOOL_LABELS
  return TOOL_LABELS[key] ?? content
}

function inlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (/^\*\*.+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (/^\*.+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>
    if (/^`.+`$/.test(p)) return <code key={i} className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono">{p.slice(1, -1)}</code>
    return p
  })
}

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length) {
      result.push(
        <ul key={result.length} className="list-disc pl-4 my-1 space-y-0.5">
          {listItems.map((item, i) => (
            <li key={i}>{inlineMarkdown(item)}</li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  lines.forEach((line, idx) => {
    const listMatch = line.match(/^[-*] (.+)/)
    if (listMatch) { listItems.push(listMatch[1]); return }
    flushList()
    if (line.trim() === '') {
      if (idx > 0) result.push(<span key={result.length} className="block h-1.5" />)
      return
    }
    const headingMatch = line.match(/^#{1,3} (.+)/)
    if (headingMatch) {
      result.push(
        <span key={result.length} className="block font-semibold mt-1">
          {inlineMarkdown(headingMatch[1])}
        </span>
      )
      return
    }
    result.push(<span key={result.length} className="block">{inlineMarkdown(line)}</span>)
  })
  flushList()
  return result
}

export default function AISidebar({
  documentId,
  documentTitle,
  getDocumentText,
  initialMessages,
  userId,
  userName,
  collaborators = [],
  onApplyContent,
  onAppendContent,
}: {
  documentId: string
  documentTitle: string
  getDocumentText: () => string
  initialMessages: { id: string; role: string; content: string; created_at: string }[]
  userId: string
  userName: string
  collaborators?: string[]
  onApplyContent: (content: string, title?: string) => void | Promise<void>
  onAppendContent: (content: string) => void | Promise<void>
}) {
  const [messages, setMessages] = useState<Message[]>(
    initialMessages.map(m => ({ id: m.id, role: m.role, content: normContent(m.content) }))
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [peersTyping, setPeersTyping] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const seenIds = useRef(new Set(initialMessages.map(m => m.id)))

  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, peersTyping])

  useEffect(() => {
    const ch = supabase
      .channel(`ai-msgs-${documentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'document_ai_messages',
          filter: `document_id=eq.${documentId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string; role: string; content: string; user_id: string
          }

          if (row.user_id === userId || seenIds.current.has(row.id)) return
          seenIds.current.add(row.id)

          let fromName: string | undefined
          if (row.role === 'user') {
            const { data } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('user_id', row.user_id)
              .single()
            fromName = data?.full_name ?? 'A collaborator'
          }

          setMessages(prev => [
            ...prev,
            { id: row.id, role: row.role, content: normContent(row.content), fromName },
          ])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, userId])

  useEffect(() => {
    const ch = supabase
      .channel(`ai-typing-${documentId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { name, active } = payload as { name: string; active: boolean }
        if (name === userName) return
        setPeersTyping(prev =>
          active
            ? prev.includes(name) ? prev : [...prev, name]
            : prev.filter(n => n !== name)
        )
      })
      .subscribe()

    typingChannelRef.current = ch
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, userName])

  function broadcastTyping(active: boolean) {
    typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { name: userName, active },
    })
  }

  async function handleSend(e: React.BaseSyntheticEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    broadcastTyping(true)

    const { data: inserted, error: insertError } = await supabase
      .from('document_ai_messages')
      .insert({
        document_id: documentId,
        user_id: userId,
        role: 'user',
        content: userMessage.content,
      })
      .select('id')
      .single()

    if (insertError) toast.error('Message could not be saved to history')
    if (inserted) seenIds.current.add(inserted.id)

    const assistantMessage: Message = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantMessage])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          documentId,
          documentTitle,
          documentText: getDocumentText(),
          collaborators,
        }),
      })

      if (!res.ok) {
        toast.error('AI request failed')
        setLoading(false)
        broadcastTyping(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const data = line.replace('data: ', '')
          if (data === '[DONE]') break

          try {
            const event = JSON.parse(data)

            if (event.type === 'text' && event.delta) {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + event.delta,
                }
                return updated
              })
            }

            if (event.type === 'tool_call') {
              const toolCall = event as { type: string } & ToolCall
              await handleToolCall(toolCall)
              const label = TOOL_LABELS[toolCall.name] ?? 'Action applied'
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: label,
                }
                return updated
              })
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      toast.error('Something went wrong')
    }

    setLoading(false)
    broadcastTyping(false)
  }

  async function handleToolCall(toolCall: ToolCall) {
    switch (toolCall.name) {
      case 'replace_document':
        await onApplyContent(toolCall.args.content, toolCall.args.title)
        toast.success('Document updated by AI')
        break
      case 'append_to_document':
        await onAppendContent(toolCall.args.content)
        toast.success('Content added to document')
        break
      case 'suggest_edit':
        await onApplyContent(`__SUGGEST_EDIT__${JSON.stringify({
          original: toolCall.args.original,
          replacement: toolCall.args.replacement,
        })}`)
        toast.success(`Edit applied: ${toolCall.args.reason}`)
        break
    }
  }

  function getMessageIcon(msg: Message) {
    if (msg.role === 'user') return <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
    const isAction = Object.values(TOOL_LABELS).includes(msg.content as string)
    if (isAction) {
      const toolName = Object.entries(TOOL_LABELS).find(([, v]) => v === msg.content)?.[0] as keyof typeof TOOL_ICONS
      const Icon = toolName ? TOOL_ICONS[toolName] : Wand2
      return <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
    }
    return <Bot className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
  }

  return (
    <div className="w-full md:w-80 flex flex-col h-full border-l bg-background shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <span className="text-sm font-medium">AI agent</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Shared · all collaborators see AI actions live
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && peersTyping.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <Bot className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Your AI co-author.</p>
              <p>Ask it to write, rewrite, expand,<br />fix, or discuss your document.</p>
              <p className="text-[10px] opacity-60 pt-1">All collaborators see AI edits live.</p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <p className="italic">Try:</p>
              <p>&ldquo;Write an intro for this&rdquo;</p>
              <p>&ldquo;Make this more concise&rdquo;</p>
              <p>&ldquo;Add a conclusion&rdquo;</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.id ?? i} className="flex gap-2">
              {getMessageIcon(msg)}
              <div className="min-w-0 flex-1">
                {msg.fromName && (
                  <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">
                    {msg.fromName}
                  </p>
                )}
                <div className={`text-sm leading-relaxed ${
                  Object.values(TOOL_LABELS).includes(msg.content as string)
                    ? 'text-primary font-medium'
                    : ''
                }`}>
                  {!msg.content && loading && i === messages.length - 1 ? (
                    <span className="text-muted-foreground animate-pulse">Thinking…</span>
                  ) : msg.role === 'assistant' && !Object.values(TOOL_LABELS).includes(msg.content) ? (
                    renderMarkdown(msg.content)
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {peersTyping.length > 0 && (
          <div className="flex gap-2 items-center">
            <Bot className="h-4 w-4 text-primary shrink-0 animate-pulse" />
            <p className="text-xs text-muted-foreground">
              {peersTyping.join(', ')} {peersTyping.length === 1 ? 'is' : 'are'} asking the AI…
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask or instruct…"
          disabled={loading}
          className="text-sm"
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
