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
  const rows = db.prepare(`
    SELECT se.id, se.job_id, se.event_type, se.payload,
           p.user_id
    FROM scan_events se
    JOIN scan_jobs sj ON sj.id = se.job_id
    JOIN profiles p ON p.id = sj.profile_id
    WHERE se.broadcast = 0
    ORDER BY se.created_at
    LIMIT 50
  `).all() as (ScanEventRow & { user_id: string })[]

  if (rows.length === 0) return

  for (const event of rows) {
    const message = JSON.stringify({
      type:    event.event_type,
      jobId:   event.job_id,
      payload: JSON.parse(event.payload),
    })

    for (const client of clients) {
      if (client.user.role === 'admin' || client.user.id === event.user_id) {
        try { client.ws.send(message) } catch { /* client disconnected */ }
      }
    }
  }

  const ids = rows.map(e => e.id)
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
