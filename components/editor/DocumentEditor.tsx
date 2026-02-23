'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { SupabaseProvider, userColor } from '@/lib/collaboration/supabase-provider'
import { AIInlineSuggestion } from './extensions/AIInlineSuggestion'
import EditorToolbar from './EditorToolbar'
import AISidebar from '@/components/ai/AISidebar'
import { Bot, X } from 'lucide-react'

type AiMessage = { id: string; role: string; content: string; created_at: string }
type Document = { id: string; title: string; content: unknown; workspace_id: string }

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6} /gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[-*] /gm, '')
    .trim()
}

export default function DocumentEditor({
  document,
  userId,
  userName,
  initialAiMessages,
}: {
  document: Document
  userId: string
  userName: string
  initialAiMessages: AiMessage[]
}) {
  const [title, setTitle] = useState(document.title)
  const [showAI, setShowAI] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connected, setConnected] = useState(false)
  const [collaboratorNames, setCollaboratorNames] = useState<string[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabaseRef = useRef(createClient())
  const ydocRef = useRef(new Y.Doc())
  const providerRef = useRef<SupabaseProvider | null>(null)
  if (!providerRef.current) {
    providerRef.current = new SupabaseProvider(
      ydocRef.current,
      supabaseRef.current,
      document.id,
      { id: userId, name: userName || 'Anonymous', color: userColor(userId) }
    )
  }

  useEffect(() => {
    const poll = setInterval(() => {
      const provider = providerRef.current
      if (!provider) return
      setConnected(provider.connected)
      const names: string[] = []
      provider.awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId !== provider.awareness.clientID) {
          const u = state.user as { name?: string } | undefined
          if (u?.name) names.push(u.name)
        }
      })
      setCollaboratorNames(names)
    }, 800)
    return () => clearInterval(poll)
  }, [])

  useEffect(() => {
    return () => {
      providerRef.current?.destroy()
      ydocRef.current.destroy()
    }
  }, [])

  const saveDocument = useCallback(async (newTitle?: string, editorJson?: object) => {
    setSaving(true)
    const update: { title?: string; content?: object } = {}
    if (newTitle !== undefined) update.title = newTitle
    if (editorJson !== undefined) update.content = editorJson
    const { error } = await supabaseRef.current
      .from('documents')
      .update(update)
      .eq('id', document.id)
    if (error) toast.error('Failed to save')
    setSaving(false)
  }, [document.id])

  const debouncedSave = useCallback((json: object) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveDocument(undefined, json), 1500)
  }, [saveDocument])

  const fetchSuggestion = useCallback(async (context: string, fullText: string): Promise<string> => {
    try {
      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, documentText: fullText }),
      })
      if (!res.ok) return ''
      const { completion } = await res.json()
      return completion ?? ''
    } catch {
      return ''
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Underline,
      Collaboration.configure({ document: ydocRef.current }),
      CollaborationCursor.configure({
        provider: providerRef.current,
        user: { name: userName || 'Anonymous', color: userColor(userId) },
      }),
      AIInlineSuggestion.configure({ fetch: fetchSuggestion }),
    ],
    immediatelyRender: false,
    onUpdate({ editor: ed }) {
      debouncedSave(ed.getJSON())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[50vh] px-1',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const timer = setTimeout(() => {
      const yXmlFragment = ydocRef.current.getXmlFragment('default')
      if (yXmlFragment.length === 0 && document.content) {
        editor.commands.setContent(document.content as object)
      }
    }, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveDocument(e.target.value), 1000)
  }

  function getEditorText() {
    return editor?.getText() ?? ''
  }


  async function streamWordsAtEnd(text: string, wordDelayMs = 26) {
    if (!editor) return
    const words = text.match(/\S+\s*/g) ?? []
    const { view } = editor
    for (const word of words) {
      const endPos = Math.max(0, view.state.doc.content.size - 1)
      view.dispatch(view.state.tr.insertText(word, endPos))
      await sleep(wordDelayMs)
    }
  }

  const handleApplyContent = useCallback(async (content: string, newTitle?: string) => {
    if (!editor) return

    if (content.startsWith('__SUGGEST_EDIT__')) {
      try {
        const { original, replacement } = JSON.parse(content.replace('__SUGGEST_EDIT__', ''))
        const currentHtml = editor.getHTML()
        if (currentHtml.includes(original)) {
          editor.commands.setContent(currentHtml.replace(original, replacement))
        } else {
          toast.error('Could not find the text to replace — try asking the AI to append instead')
        }
      } catch {
        toast.error('Edit could not be applied')
      }
      return
    }

    editor.commands.clearContent()

    if (newTitle) {
      setTitle(newTitle)
      saveDocument(newTitle)
    }

    await streamWordsAtEnd(stripMarkdown(content))
    saveDocument(undefined, editor.getJSON())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, saveDocument])

  const handleAppendContent = useCallback(async (content: string) => {
    if (!editor) return
    await streamWordsAtEnd(stripMarkdown(content))
    saveDocument(undefined, editor.getJSON())
  }, [editor, saveDocument])

  return (
    <div className="flex flex-col md:flex-row h-full">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <EditorToolbar
          editor={editor}
          saving={saving}
          connected={connected}
          provider={providerRef.current}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled"
              className="w-full text-2xl sm:text-3xl font-bold tracking-tight bg-transparent border-none outline-none placeholder:text-muted-foreground mb-4 sm:mb-6 resize-none"
            />
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* AI toggle button */}
      <div className="border-t md:border-t-0 md:border-l flex md:flex-col">
        <button
          onClick={() => setShowAI(v => !v)}
          className="p-3 hover:bg-muted transition-colors"
          title="Toggle AI agent"
        >
          {showAI ? <X className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </button>
      </div>

     
      {showAI && (
        <div className="fixed bottom-0 left-0 right-0 z-40 md:relative md:bottom-auto md:left-auto md:right-auto md:z-auto h-[55vh] md:h-full flex flex-col shadow-xl md:shadow-none border-t md:border-t-0">
          <AISidebar
            documentId={document.id}
            documentTitle={title}
            getDocumentText={getEditorText}
            initialMessages={initialAiMessages}
            userId={userId}
            userName={userName}
            collaborators={collaboratorNames}
            onApplyContent={handleApplyContent}
            onAppendContent={handleAppendContent}
          />
        </div>
      )}
    </div>
  )
}
