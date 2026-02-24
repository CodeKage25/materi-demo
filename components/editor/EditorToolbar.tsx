'use client'

import { useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { SupabaseProvider } from '@/lib/collaboration/supabase-provider'
import {
  Bold, Italic, Underline as UnderlineIcon, Code,
  Heading1, Heading2, List, ListOrdered, Quote, Minus,
  Wifi, WifiOff, Share2, Wand2,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

type AwarenessUser = { name: string; color: string; userId: string }

type Props = {
  editor: Editor | null
  saving: boolean
  connected: boolean
  provider: SupabaseProvider | null
  shareUrl?: string
  aiEditing?: boolean
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

export default function EditorToolbar({ editor, saving, connected, provider, shareUrl, aiEditing }: Props) {
  const [onlineUsers, setOnlineUsers] = useState<AwarenessUser[]>([])

  useEffect(() => {
    if (!provider) return

    const updateUsers = () => {
      const states = provider.awareness.getStates()
      const users: AwarenessUser[] = []
      states.forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId !== provider.awareness.clientID && state.user) {
          users.push(state.user as AwarenessUser)
        }
      })
      setOnlineUsers(users)
    }

    provider.awareness.on('change', updateUsers)
    updateUsers()

    return () => { provider.awareness.off('change', updateUsers) }
  }, [provider])

  function handleShare() {
    const url = shareUrl ?? window.location.href
    navigator.clipboard.writeText(url)
    toast.success('Link copied — anyone in this workspace can edit')
  }

  if (!editor) return null

  return (
    <div className="flex items-center gap-0.5 pl-14 pr-2 md:px-4 py-2 border-b bg-background sticky top-0 z-10 overflow-x-auto">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold (⌘B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic (⌘I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline (⌘U)"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        title="Inline code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet list"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Ordered list"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Quote"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Divider"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      <div className="ml-auto flex items-center gap-2 shrink-0 pl-2">
        {/* AI editing indicator */}
        {aiEditing && (
          <span className="hidden sm:flex items-center gap-1 text-xs text-primary animate-pulse">
            <Wand2 className="h-3 w-3" />
            AI editing…
          </span>
        )}

        {/* Online collaborators — hidden on small screens */}
        {onlineUsers.length > 0 && (
          <div className="hidden sm:flex items-center -space-x-1.5">
            {onlineUsers.slice(0, 4).map((u, i) => (
              <div
                key={u.userId ?? i}
                title={u.name}
                className="h-6 w-6 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-medium text-white"
                style={{ backgroundColor: u.color }}
              >
                {u.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
            ))}
            {onlineUsers.length > 4 && (
              <div className="h-6 w-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                +{onlineUsers.length - 4}
              </div>
            )}
          </div>
        )}

        {/* Share button */}
        <button
          onClick={handleShare}
          title="Copy link to share"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Share</span>
        </button>

        {/* Connection + save status */}
        <div
          className="flex items-center gap-1.5"
          title={connected ? 'Live sync active' : 'Connecting…'}
        >
          {connected ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-muted-foreground animate-pulse" />
          )}
          <span className="hidden sm:inline text-xs text-muted-foreground">
            {saving ? 'Saving…' : 'Saved'}
          </span>
        </div>
      </div>
    </div>
  )
}
