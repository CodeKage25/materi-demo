'use client'

import { BubbleMenu, type Editor } from '@tiptap/react'
import { useState } from 'react'
import { Wand2, Minimize2, Maximize2, SpellCheck2, Bold, Italic, Underline as UnderlineIcon } from 'lucide-react'

const AI_ACTIONS = [
  { key: 'improve', label: 'Improve', icon: Wand2 },
  { key: 'shorten', label: 'Shorten', icon: Minimize2 },
  { key: 'expand', label: 'Expand', icon: Maximize2 },
  { key: 'fix', label: 'Fix', icon: SpellCheck2 },
] as const

type ActionKey = (typeof AI_ACTIONS)[number]['key']

export default function AIBubbleMenu({
  editor,
  onTransform,
}: {
  editor: Editor
  onTransform: (action: string, text: string, from: number, to: number) => Promise<void>
}) {
  const [loading, setLoading] = useState<ActionKey | null>(null)

  async function handleAction(action: ActionKey) {
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, '\n')
    if (!selectedText.trim()) return

    setLoading(action)
    try {
      await onTransform(action, selectedText, from, to)
    } finally {
      setLoading(null)
    }
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, placement: 'top', maxWidth: 'none' }}
      shouldShow={({ state }) => {
        const { from, to } = state.selection
        return from !== to && state.doc.textBetween(from, to).trim().length > 0
      }}
    >
      <div className="flex items-center rounded-lg border bg-background shadow-lg overflow-hidden divide-x">
        {/* Inline formatting */}
        <div className="flex items-center px-1 py-1 gap-0.5">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-muted transition-colors ${
              editor.isActive('bold') ? 'bg-muted text-foreground' : 'text-muted-foreground'
            }`}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-muted transition-colors ${
              editor.isActive('italic') ? 'bg-muted text-foreground' : 'text-muted-foreground'
            }`}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded hover:bg-muted transition-colors ${
              editor.isActive('underline') ? 'bg-muted text-foreground' : 'text-muted-foreground'
            }`}
            title="Underline"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* AI actions */}
        <div className="flex items-center px-1 py-1 gap-0.5">
          {AI_ACTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleAction(key)}
              disabled={loading !== null}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-muted transition-colors disabled:opacity-50 text-muted-foreground hover:text-foreground"
              title={`${label} selected text with AI`}
            >
              <Icon className="h-3.5 w-3.5" />
              {loading === key ? '…' : label}
            </button>
          ))}
        </div>
      </div>
    </BubbleMenu>
  )
}
