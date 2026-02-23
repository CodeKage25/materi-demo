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
import EditorToolbar from './EditorToolbar'
import AISidebar from '@/components/ai/AISidebar'
import { Bot, X } from 'lucide-react'

type AiMessage = { id: string; role: string; content: string; created_at: string }
type Document = { id: string; title: string; content: unknown; workspace_id: string }

function markdownToHtml(markdown: string) {
  return markdown
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hl])(.+)$/gm, (match) =>
      match.trim() && !match.startsWith('<') ? `<p>${match}</p>` : match
    )
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

      const states = provider.awareness.getStates()
      const names: string[] = []
      states.forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId !== provider.awareness.clientID) {
          const user = state.user as { name?: string } | undefined
          if (user?.name) names.push(user.name)
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Underline,
      Collaboration.configure({ document: ydocRef.current }),
      CollaborationCursor.configure({
        provider: providerRef.current,
        user: {
          name: userName || 'Anonymous',
          color: userColor(userId),
        },
      }),
    ],
    immediatelyRender: false,
    onUpdate({ editor: ed }) {
      debouncedSave(ed.getJSON())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[60vh] px-1',
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
    if (!editor) return ''
    return editor.getText()
  }

  const handleApplyContent = useCallback((content: string, newTitle?: string) => {
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

    const html = markdownToHtml(content)
    editor.commands.setContent(html)

    if (newTitle) {
      setTitle(newTitle)
      saveDocument(newTitle)
    }

    saveDocument(undefined, editor.getJSON())
  }, [editor, saveDocument])

  const handleAppendContent = useCallback((content: string) => {
    if (!editor) return
    const html = markdownToHtml(content)
    editor.commands.focus('end')
    editor.commands.insertContent(html)
    saveDocument(undefined, editor.getJSON())
  }, [editor, saveDocument])

  return (
    <div className="flex h-full">
      {/* Editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        <EditorToolbar
          editor={editor}
          saving={saving}
          connected={connected}
          provider={providerRef.current}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-10">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled"
              className="w-full text-3xl font-bold tracking-tight bg-transparent border-none outline-none placeholder:text-muted-foreground mb-6 resize-none"
            />
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* AI toggle */}
      <div className="border-l flex flex-col">
        <button
          onClick={() => setShowAI(v => !v)}
          className="p-3 hover:bg-muted transition-colors"
          title="Toggle AI agent"
        >
          {showAI ? <X className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </button>
      </div>

      {/* AI Sidebar */}
      {showAI && (
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
      )}
    </div>
  )
}
