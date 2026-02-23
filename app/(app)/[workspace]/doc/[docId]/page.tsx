import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import DocumentEditor from '@/components/editor/DocumentEditor'

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ workspace: string; docId: string }>
}) {
  const { docId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch profile for display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .single()

  // Fetch document — RLS ensures user is a workspace member
  const { data: document } = await supabase
    .from('documents')
    .select('id, title, content, workspace_id')
    .eq('id', docId)
    .single()

  if (!document) notFound()

  // Fetch existing AI messages for this document
  const { data: aiMessages } = await supabase
    .from('document_ai_messages')
    .select('id, role, content, created_at')
    .eq('document_id', docId)
    .order('created_at', { ascending: true })

  return (
    <DocumentEditor
      document={document}
      userId={user.id}
      userName={profile?.full_name ?? user.email ?? 'Anonymous'}
      initialAiMessages={aiMessages ?? []}
    />
  )
}
