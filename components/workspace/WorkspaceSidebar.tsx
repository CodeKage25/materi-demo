'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, FileText, ChevronDown, LogOut, Menu, X } from 'lucide-react'

type Document = { id: string; title: string; updated_at: string }
type Workspace = { id: string; name: string; slug: string }
type User = { email: string; fullName: string }

export default function WorkspaceSidebar({
  workspace,
  user,
}: {
  workspace: Workspace
  user: User
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [creating, setCreating] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const fetchDocuments = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('documents')
      .select('id, title, updated_at')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false })

    if (data) setDocuments(data)
  }, [workspace.id])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  async function createDocument() {
    setCreating(true)
    const supabase = createClient()

    const { data, error } = await supabase.rpc('create_document', {
      p_workspace_id: workspace.id,
      p_title: 'Untitled',
    })

    setCreating(false)

    if (error) {
      toast.error('Failed to create document')
      return
    }

    await fetchDocuments()
    router.push(`/${workspace.slug}/doc/${data.id}`)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Mobile hamburger — always visible, same height as toolbar */}
      <button
        className="md:hidden fixed top-0 left-0 z-50 h-[45px] w-12 flex items-center justify-center bg-background border-r border-b"
        onClick={() => setMobileOpen(v => !v)}
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r bg-background shadow-xl',
          'transition-transform duration-200 ease-in-out',
          'md:relative md:inset-auto md:w-56 md:shadow-none md:z-auto md:bg-muted/30 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        {/* Spacer so content clears the hamburger button on mobile */}
        <div className="md:hidden h-[45px] shrink-0" />

        {/* Workspace header */}
        <div className="p-3 border-b">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-sm font-medium">
                <span className="truncate">{workspace.name}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem className="text-xs text-muted-foreground" disabled>
                {user.email}
              </DropdownMenuItem>
              <Separator className="my-1" />
              <DropdownMenuItem onClick={handleSignOut} className="text-sm">
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* New document button */}
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={createDocument}
            disabled={creating}
          >
            <Plus className="h-4 w-4 mr-2" />
            New document
          </Button>
        </div>

        <Separator />

        {/* Document list */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-3">
              No documents yet. Create one above.
            </p>
          ) : (
            documents.map(doc => {
              const isActive = pathname.includes(doc.id)
              return (
                <Link
                  key={doc.id}
                  href={`/${workspace.slug}/doc/${doc.id}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{doc.title || 'Untitled'}</span>
                </Link>
              )
            })
          )}
        </nav>
      </aside>
    </>
  )
}
