import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const PORT = parseInt(process.env.YJS_PORT ?? '4444', 10)
const HOST = process.env.YJS_HOST ?? '0.0.0.0'

// Message types matching y-websocket protocol
const MSG_SYNC = 0
const MSG_AWARENESS = 1

/** @type {Map<string, { doc: Y.Doc, awareness: awarenessProtocol.Awareness, conns: Set<import('ws').WebSocket> }>} */
const rooms = new Map()

function getRoom(roomName) {
  let room = rooms.get(roomName)
  if (!room) {
    const doc = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(doc)

    // Clean up awareness when it changes
    awareness.on('update', (/** @type {{ added: number[], updated: number[], removed: number[] }} */ changes, conn) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, [
          ...changes.added,
          ...changes.updated,
          ...changes.removed,
        ])
      )
      const msg = encoding.toUint8Array(encoder)
      room.conns.forEach((ws) => {
        if (ws.readyState === ws.OPEN) ws.send(msg)
      })
    })

    room = { doc, awareness, conns: new Set() }
    rooms.set(roomName, room)
  }
  return room
}

function handleMessage(ws, room, message) {
  try {
    const msg = new Uint8Array(message)
    const decoder = decoding.createDecoder(msg)
    const msgType = decoding.readVarUint(decoder)

    switch (msgType) {
      case MSG_SYNC: {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MSG_SYNC)
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, null)
        const reply = encoding.toUint8Array(encoder)
        // Only send if there's content beyond the message type header
        if (encoding.length(encoder) > 1) {
          ws.send(reply)
        }
        break
      }
      case MSG_AWARENESS: {
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
          ws
        )
        break
      }
    }
  } catch (err) {
    console.error('Error handling message:', err)
  }
}

function sendSync(ws, doc) {
  // Send sync step 1
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MSG_SYNC)
  syncProtocol.writeSyncStep1(encoder, doc)
  ws.send(encoding.toUint8Array(encoder))
}

function sendAwareness(ws, awareness) {
  const states = awareness.getStates()
  if (states.size > 0) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(
        awareness,
        Array.from(states.keys())
      )
    )
    ws.send(encoding.toUint8Array(encoder))
  }
}

const wss = new WebSocketServer({ port: PORT, host: HOST })

wss.on('connection', (ws, req) => {
  // Room name from the URL path, e.g. /doc-<uuid>
  const roomName = (req.url ?? '/').slice(1) || 'default'
  const room = getRoom(roomName)
  room.conns.add(ws)

  // Send initial sync & awareness
  sendSync(ws, room.doc)
  sendAwareness(ws, room.awareness)

  ws.on('message', (msg) => handleMessage(ws, room, msg))

  ws.on('close', () => {
    room.conns.delete(ws)
    // Remove awareness state for this client
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      [ws.__awarenessClientId].filter(Boolean),
      null
    )
    // Clean up empty rooms after a delay
    if (room.conns.size === 0) {
      setTimeout(() => {
        if (room.conns.size === 0) {
          room.doc.destroy()
          rooms.delete(roomName)
        }
      }, 30_000) // 30s grace period
    }
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
  })
})

wss.on('listening', () => {
  console.log(`\n  🟢 Materi collab server running on ws://${HOST}:${PORT}\n`)
})

wss.on('error', (err) => {
  console.error('Collab server error:', err)
  process.exit(1)
})

process.on('SIGTERM', () => { console.log('Shutting down…'); wss.close(); process.exit(0) })
process.on('SIGINT', () => { console.log('Shutting down…'); wss.close(); process.exit(0) })
