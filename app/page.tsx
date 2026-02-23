import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user has any workspace memberships
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(slug)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!memberships) {
    redirect('/onboarding')
  }

  const workspace = memberships.workspaces as unknown as { slug: string } | null
  if (workspace?.slug) {
    redirect(`/${workspace.slug}`)
  }

  redirect('/onboarding')
}
