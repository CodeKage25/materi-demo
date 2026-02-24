import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'

export interface CollaboratorUser {
  id: string
  name: string
  color: string
}

export class SupabaseProvider {
  readonly doc: Y.Doc
  readonly awareness: awarenessProtocol.Awareness
  private channel: RealtimeChannel
  private _connected = false
  private _synced = false
  private _onAiEditingChange?: (active: boolean) => void

  constructor(
    doc: Y.Doc,
    supabase: SupabaseClient,
    documentId: string,
    user: CollaboratorUser
  ) {
    this.doc = doc
    this.awareness = new awarenessProtocol.Awareness(doc)

    this.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      color: user.color,
    })

    this.channel = supabase.channel(`doc-${documentId}`, {
      config: { broadcast: { ack: false, self: false } },
    })

    
    this.channel.on('broadcast', { event: 'yjs-update' }, ({ payload }) => {
      try {
        const update = new Uint8Array(payload.update as number[])
        Y.applyUpdate(this.doc, update, 'remote')
      } catch {
      }
    })

    this.channel.on('broadcast', { event: 'awareness-update' }, ({ payload }) => {
      try {
        const update = new Uint8Array(payload.update as number[])
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, 'remote')
      } catch {
      }
    })

    
    this.channel.on('broadcast', { event: 'sync-request' }, () => {
      const fullState = Y.encodeStateAsUpdate(this.doc)
      this.channel.send({
        type: 'broadcast',
        event: 'sync-response',
        payload: { update: Array.from(fullState) },
      })
    })

    
    this.channel.on('broadcast', { event: 'sync-response' }, ({ payload }) => {
      try {
        const update = new Uint8Array(payload.update as number[])
        Y.applyUpdate(this.doc, update, 'remote')
        this._synced = true
      } catch {
      }
    })


    this.channel.on('broadcast', { event: 'ai-editing' }, ({ payload }) => {
      const { active } = payload as { active: boolean }
      this._onAiEditingChange?.(active)
    })

    this.channel.subscribe((status) => {
      this._connected = status === 'SUBSCRIBED'
      if (status === 'SUBSCRIBED') {
        setTimeout(() => {
          this.channel.send({
            type: 'broadcast',
            event: 'sync-request',
            payload: {},
          })
        }, 150)
      }
    })

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return
      this.channel.send({
        type: 'broadcast',
        event: 'yjs-update',
        payload: { update: Array.from(update) },
      })
    })

    this.awareness.on('update', ({ added, updated, removed }: {
      added: number[]; updated: number[]; removed: number[]
    }) => {
      const changed = [...added, ...updated, ...removed]
      const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      this.channel.send({
        type: 'broadcast',
        event: 'awareness-update',
        payload: { update: Array.from(update) },
      })
    })
  }

  get connected() {
    return this._connected
  }

  
  get synced() {
    return this._synced
  }

 
  set onAiEditingChange(cb: (active: boolean) => void) {
    this._onAiEditingChange = cb
  }

  broadcastAiEditing(active: boolean) {
    this.channel.send({
      type: 'broadcast',
      event: 'ai-editing',
      payload: { active },
    })
  }

  broadcastFullState() {
    const fullState = Y.encodeStateAsUpdate(this.doc)
    this.channel.send({
      type: 'broadcast',
      event: 'sync-response',
      payload: { update: Array.from(fullState) },
    })
  }

  destroy() {
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      'destroy'
    )
    this.awareness.destroy()
    this.channel.unsubscribe()
  }
}

export function userColor(userId: string): string {
  const colors = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#84cc16',
  ]
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
