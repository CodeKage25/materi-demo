import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { FileText } from 'lucide-react'

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspace: string }>
}) {
  const { workspace: slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!workspace) notFound()

  const { data: documents } = await supabase
    .from('documents')
    .select('id, title, updated_at')
    .eq('workspace_id', workspace.id)
    .order('updated_at', { ascending: false })

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <h1 className="text-xl font-semibold mb-6">{workspace.name}</h1>

      {documents && documents.length > 0 ? (
        <div className="space-y-1">
          {documents.map(doc => (
            <a
              key={doc.id}
              href={`/${slug}/doc/${doc.id}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors group"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {doc.title || 'Untitled'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(doc.updated_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No documents yet.</p>
          <p className="text-xs mt-1">Click &quot;New document&quot; in the sidebar to get started.</p>
        </div>
      )}
    </div>
  )
}
