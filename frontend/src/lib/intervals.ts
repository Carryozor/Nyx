// Auto-scan interval presets (in days), shared by the schedule selectors.
export const SCAN_INTERVALS = [7, 14, 30, 60, 90, 180, 365]

/** Human label for an interval in days (6 months / 1 year get friendly names). */
export function intervalLabel(days: number): string {
  if (days === 365) return '1 an'
  if (days === 180) return '6 mois'
  return `${days} jours`
}
