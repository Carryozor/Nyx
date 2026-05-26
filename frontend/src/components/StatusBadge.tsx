interface Props { status: string }

const colors: Record<string, string> = {
  pending:        'bg-slate-700 text-slate-200',
  queued:         'bg-slate-700 text-slate-200',
  running:        'bg-blue-900 text-blue-200',
  submitted:      'bg-yellow-900 text-yellow-200',
  awaiting_email: 'bg-orange-900 text-orange-200',
  confirmed:      'bg-green-900 text-green-200',
  done:           'bg-green-900 text-green-200',
  failed:         'bg-red-900 text-red-200',
  manual:         'bg-purple-900 text-purple-200',
  already_removed:'bg-green-900 text-green-200',
}

const labels: Record<string, string> = {
  awaiting_email:  'email pending',
  already_removed: 'already removed',
}

export function StatusBadge({ status }: Props) {
  const cls = colors[status] ?? 'bg-slate-700 text-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {labels[status] ?? status}
    </span>
  )
}
