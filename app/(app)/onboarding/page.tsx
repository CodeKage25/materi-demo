'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.BaseSyntheticEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const slug = slugify(name) || `workspace-${Date.now()}`

    const { data, error } = await supabase.rpc('create_workspace', {
      p_name: name,
      p_slug: slug,
    })

    if (error) {
      toast.error(error.message.includes('unique') ? 'That name is taken, try another.' : 'Failed to create workspace.')
      setLoading(false)
      return
    }

    router.push(`/${data.slug}`)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            A workspace is where your documents live.
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Workspace name</Label>
            <Input
              id="name"
              type="text"
              placeholder="My Workspace"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
            {name && (
              <p className="text-xs text-muted-foreground">
                URL: <span className="font-mono">/{slugify(name)}</span>
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create workspace'}
          </Button>
        </form>
      </div>
    </div>
  )
}
