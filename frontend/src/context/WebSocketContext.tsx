import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ScanEventPayload } from '../types.js'

export interface ScanProgress {
  jobId:          string
  currentBroker?: string
  done:           number
  total:          number
  brokerStatus:   Map<string, string>
  brokerNotes:    Map<string, string>
  complete:       boolean
}

interface WsContextValue {
  connected: boolean
  scans:     Map<string, ScanProgress>
  clearScan: (jobId: string) => void
}

const WsContext = createContext<WsContextValue>({
  connected: false,
  scans: new Map(),
  clearScan: () => {},
})

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const ws = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [scans, setScans] = useState<Map<string, ScanProgress>>(new Map())

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket   = new WebSocket(`${protocol}//${window.location.host}/ws`)
    ws.current = socket

    socket.onmessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data as string) as ScanEventPayload
      if (msg.type === 'auth:ok')    { setConnected(true);  return }
      if (msg.type === 'auth:error') { setConnected(false); return }

      if (msg.type === 'progress' || msg.type === 'broker_done' || msg.type === 'complete') {
        setScans(prev => {
          const m   = new Map(prev)
          const cur = m.get(msg.jobId) ?? {
            jobId: msg.jobId, done: 0, total: 0,
            brokerStatus: new Map(), brokerNotes: new Map(), complete: false,
          }
          const brokerStatus = new Map(cur.brokerStatus)
          const brokerNotes  = new Map(cur.brokerNotes)
          const updated: ScanProgress = { ...cur, brokerStatus, brokerNotes }

          if (msg.type === 'progress') {
            updated.currentBroker = msg.payload.broker
            brokerStatus.set(msg.payload.broker, 'running')
          }
          if (msg.type === 'broker_done') {
            updated.done += 1
            updated.currentBroker = msg.payload.broker
            brokerStatus.set(msg.payload.broker, msg.payload.status)
            if (msg.payload.notes) brokerNotes.set(msg.payload.broker, msg.payload.notes)
          }
          if (msg.type === 'complete') {
            updated.total    = msg.payload.brokerCount
            updated.done     = msg.payload.brokerCount
            updated.complete = true
          }
          m.set(msg.jobId, updated)
          return m
        })
      }
    }

    socket.onclose = () => setConnected(false)
    return () => { socket.close() }
  }, [])

  const clearScan = (jobId: string) => {
    setScans(prev => { const m = new Map(prev); m.delete(jobId); return m })
  }

  return <WsContext.Provider value={{ connected, scans, clearScan }}>{children}</WsContext.Provider>
}

export function useWsContext() { return useContext(WsContext) }
