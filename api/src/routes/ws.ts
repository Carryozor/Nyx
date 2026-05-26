import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { verifyToken } from '../auth/jwt.js'
import { getDb } from '../db/client.js'
import type { AuthUser, ScanEventRow } from '../types.js'

interface ConnectedClient {
  ws:   WebSocket
  user: AuthUser
}

const clients = new Set<ConnectedClient>()

export function startBroadcastLoop(): void {
  setInterval(broadcastPending, 300)
}

function broadcastPending(): void {
  if (clients.size === 0) return

  const db = getDb()
  const events = db.prepare(
    'SELECT * FROM scan_events WHERE broadcast = 0 ORDER BY created_at LIMIT 50'
  ).all() as ScanEventRow[]

  if (events.length === 0) return

  for (const event of events) {
    const job = db.prepare('SELECT profile_id FROM scan_jobs WHERE id = ?').get(event.job_id) as { profile_id: string } | undefined
    if (!job) continue

    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(job.profile_id) as { user_id: string } | undefined
    if (!profile) continue

    const message = JSON.stringify({
      type:    event.event_type,
      jobId:   event.job_id,
      payload: JSON.parse(event.payload),
    })

    for (const client of clients) {
      if (client.user.role === 'admin' || client.user.id === profile.user_id) {
        try { client.ws.send(message) } catch { /* client disconnected */ }
      }
    }
  }

  const ids = events.map(e => e.id)
  db.prepare(
    `UPDATE scan_events SET broadcast = 1 WHERE id IN (${ids.map(() => '?').join(',')})`
  ).run(...ids)
}

export function registerWsRoutes(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket: WebSocket, req) => {
    let client: ConnectedClient | null = null

    const cookieToken = (req.cookies as Record<string, string>)?.nyx_session
    if (cookieToken) {
      try {
        const user = verifyToken(cookieToken)
        client = { ws: socket, user }
        clients.add(client)
        socket.send(JSON.stringify({ type: 'auth:ok', userId: user.id }))
      } catch {
        socket.send(JSON.stringify({ type: 'auth:error', error: 'Invalid session' }))
        socket.close()
        return
      }
    } else {
      socket.send(JSON.stringify({ type: 'auth:error', error: 'No session cookie' }))
      socket.close()
      return
    }

    socket.on('close', () => {
      if (client) clients.delete(client)
    })
  })
}
