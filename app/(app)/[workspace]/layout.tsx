import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WorkspaceSidebar from '@/components/workspace/WorkspaceSidebar'

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspace: string }>
}) {
  const { workspace: slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.rpc('auto_join_workspace', { p_slug: slug })

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()

  if (!workspace) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <WorkspaceSidebar
        workspace={workspace}
        user={{ email: user.email ?? '', fullName: profile?.full_name ?? '' }}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
