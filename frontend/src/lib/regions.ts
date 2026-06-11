// Country / region grouping for the scan target selector.
// 'EU' is a pan-European broker tag (not a country); it is pulled in only via a
// region button, never by selecting individual countries.

export const PAN_EU_TAG = 'EU'

/** EU member states present in the broker set. */
export const EU_COUNTRIES = ['BE', 'DE', 'ES', 'FR', 'IT', 'NL', 'PL', 'SE']

/** Geographic Europe = EU members + non-EU European countries. */
export const EUROPE_COUNTRIES = [...EU_COUNTRIES, 'CH', 'UK']

export type RegionKey = 'all' | 'ue' | 'europe' | 'us'

/** Region → the country codes it selects (region buttons add the pan-EU tag). */
export const REGION_CODES: Record<Exclude<RegionKey, 'all'>, string[]> = {
  ue:     [...EU_COUNTRIES, PAN_EU_TAG],
  europe: [...EUROPE_COUNTRIES, PAN_EU_TAG],
  us:     ['US'],
}

export const COUNTRY_LABELS: Record<string, string> = {
  FR: 'France', DE: 'Allemagne', ES: 'Espagne', IT: 'Italie', NL: 'Pays-Bas',
  BE: 'Belgique', PL: 'Pologne', SE: 'Suède', CH: 'Suisse', UK: 'Royaume-Uni',
  US: 'États-Unis', EU: 'Pan-européen',
}

export function countryLabel(code: string): string {
  return COUNTRY_LABELS[code] ?? code
}
