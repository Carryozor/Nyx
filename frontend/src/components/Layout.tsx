import { Sidebar } from './Sidebar.js'
import { ScanProgress } from './ScanProgress.js'
import { useWebSocket } from '../hooks/useWebSocket.js'

interface Props { children: React.ReactNode }

export function Layout({ children }: Props) {
  const { scans, clearScan } = useWebSocket()

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <ScanProgress scans={scans} onDismiss={clearScan} />
    </div>
  )
}
