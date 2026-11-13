/**
 * Typed client for the Project Arrow policy API.
 * In development Vite proxies /api -> http://127.0.0.1:8000 (see vite.config.ts).
 */

const BASE = '/api'

export type Summary = {
  year: string
  reporting_years: string[]
  guest_nights: number
  scope1_kg: number
  scope2_kg: number
  scope3_kg: number
  total_kg: number
  property_count: number
  kg_per_guest_night: number
  national_intensity: number
  suppressed: boolean
}

export type GroupStat = {
  guest_nights: number
  scope1_kg: number
  scope2_kg: number
  scope3_kg: number
  total_kg: number
  property_count: number
  kg_per_guest_night: number
  suppressed: boolean
}

export type DistrictStat = GroupStat & {
  district: string
  province: string
  lat: number | null
  lng: number | null
}

export type SegmentStat = GroupStat & { segment: string }
export type SizeBandStat = GroupStat & { size_band: string }

export type TrendPoint = GroupStat & {
  period: string
  label: string
  reporting_year: string
}

export type PathwayResult = {
  year: string
  baseline_total_kg: number
  projected_total_kg: number
  avoided_kg: number
  reduction_pct: number
  scope1_kg: number
  scope2_kg: number
  scope3_kg: number
  assumptions: {
    scope1_reduction_pct: number
    scope2_reduction_pct: number
    scope3_reduction_pct: number
  }
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const search = new URLSearchParams()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value))
    }
  }
  const query = search.toString()
  const response = await fetch(`${BASE}${path}${query ? `?${query}` : ''}`)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`${response.status} ${response.statusText} - ${detail}`)
  }
  return (await response.json()) as T
}

export const policyApi = {
  periods: () => get<{ reporting_years: string[]; reporting_year_start: string }>('/policy/periods'),
  summary: (year?: string) => get<Summary>('/policy/summary', { year }),
  byDistrict: (year?: string) => get<DistrictStat[]>('/policy/by-district', { year }),
  bySegment: (year?: string) => get<SegmentStat[]>('/policy/by-segment', { year }),
  bySizeBand: (year?: string) => get<SizeBandStat[]>('/policy/by-size-band', { year }),
  trends: (year?: string) => get<TrendPoint[]>('/policy/trends', { year }),
  gis: (year?: string) => get<DistrictStat[]>('/policy/gis', { year }),
  pathway: (
    year: string | undefined,
    scope1: number,
    scope2: number,
    scope3: number,
  ) =>
    get<PathwayResult>('/policy/pathway', {
      year,
      scope1_reduction_pct: scope1,
      scope2_reduction_pct: scope2,
      scope3_reduction_pct: scope3,
    }),
}
