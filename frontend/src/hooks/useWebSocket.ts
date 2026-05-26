import { useEffect, useRef, useState } from 'react'
import type { ScanEventPayload } from '../types.js'

export interface ScanProgress {
  jobId:         string
  currentBroker?: string
  done:          number
  total:         number
  events:        ScanEventPayload[]
}

export function useWebSocket(jwtToken: string | null) {
  const ws = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [scans, setScans] = useState<Map<string, ScanProgress>>(new Map())

  useEffect(() => {
    if (!jwtToken) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket   = new WebSocket(`${protocol}//${window.location.host}/ws`)
    ws.current = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', token: jwtToken }))
    }

    socket.onmessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data as string) as ScanEventPayload
      setConnected(true)

      if (msg.type === 'progress' || msg.type === 'broker_done' || msg.type === 'complete') {
        setScans(prev => {
          const m = new Map(prev)
          const cur = m.get(msg.jobId) ?? { jobId: msg.jobId, done: 0, total: 0, events: [] }
          const updated: ScanProgress = {
            ...cur,
            events: [...cur.events, msg],
          }
          if (msg.type === 'broker_done') {
            updated.done += 1
            updated.currentBroker = msg.payload.broker
          }
          if (msg.type === 'complete') {
            updated.total = msg.payload.brokerCount
            updated.done  = msg.payload.brokerCount
          }
          if (msg.type === 'progress') {
            updated.currentBroker = msg.payload.broker
          }
          m.set(msg.jobId, updated)
          return m
        })
      }
    }

    socket.onclose = () => setConnected(false)

    return () => { socket.close() }
  }, [jwtToken])

  const clearScan = (jobId: string) => {
    setScans(prev => { const m = new Map(prev); m.delete(jobId); return m })
  }

  return { connected, scans, clearScan }
}
