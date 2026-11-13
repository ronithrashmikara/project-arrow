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

export type Overview = {
  year: string
  reporting_years: string[]
  properties_reporting: number
  total_co2e_kg: number
  total_co2e_tonnes: number
  median_intensity: number
  grid_share_pct: number
  scope1_kg: number
  scope2_kg: number
  scope3_kg: number
  guest_nights: number
  estimated_properties: number
  deltas: {
    properties_vs_previous?: number
    total_kg_change_pct?: number
    median_intensity_change?: number
    previous_year?: string
  }
}

export type DistrictHeatStat = {
  district: string
  province: string
  lat: number | null
  lng: number | null
  property_count: number
  total_kg: number
  guest_nights: number
  scope1_kg: number
  scope2_kg: number
  scope3_kg: number
  median_intensity: number
  min_intensity: number
  max_intensity: number
  kg_per_guest_night: number
  suppressed: boolean
}

export type CategoryStat = {
  category: string
  property_count: number
  suppressed: boolean
  min?: number
  q1?: number
  median?: number
  q3?: number
  max?: number
  lower_whisker?: number
  upper_whisker?: number
  outliers?: number[]
  mean?: number
  values: number[]
}

export type SeasonPoint = {
  period: string
  label: string
  season: 'peak' | 'off-peak'
  total_kg: number
  kg_per_guest_night: number
  guest_nights: number
}

export type Seasonality = {
  points: SeasonPoint[]
  peak_average_intensity: number
  off_peak_average_intensity: number
  peak_months: string[]
}

export type LeaderboardEntry = {
  pseudonym: string
  category_group: string
  size_band: string
  rank: number
  kg_per_guest_night: number
  group_median: number
  tier: 'Leader' | 'Good' | 'Needs improvement'
  guest_nights: number
}

export type Leaderboard = {
  entries: LeaderboardEntry[]
  groups: number
  k_threshold: number
}

export type ReportSection = { heading: string; body: string }

export type BaselineReport = {
  year: string
  generated_for: string
  badge: string
  sections: ReportSection[]
  dataset_hash: string
  properties_reporting: number
  suppressed_districts: number
  categories: { category: string; property_count: number; median: number | null; suppressed: boolean }[]
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
  overview: (year?: string) => get<Overview>('/policy/overview', { year }),
  byDistrict: (year?: string) => get<DistrictStat[]>('/policy/by-district', { year }),
  districtStats: (year?: string) => get<DistrictHeatStat[]>('/policy/district-stats', { year }),
  bySegment: (year?: string) => get<SegmentStat[]>('/policy/by-segment', { year }),
  bySizeBand: (year?: string) => get<SizeBandStat[]>('/policy/by-size-band', { year }),
  trends: (year?: string) => get<TrendPoint[]>('/policy/trends', { year }),
  gis: (year?: string) => get<DistrictStat[]>('/policy/gis', { year }),
  categoryStats: (year?: string) => get<CategoryStat[]>('/policy/category-stats', { year }),
  seasonality: (year?: string) => get<Seasonality>('/policy/seasonality', { year }),
  leaderboard: (year?: string) => get<Leaderboard>('/policy/leaderboard', { year }),
  baselineReport: (year?: string) => get<BaselineReport>('/policy/baseline-report', { year }),
  pathway: (year: string | undefined, scope1: number, scope2: number, scope3: number) =>
    get<PathwayResult>('/policy/pathway', {
      year,
      scope1_reduction_pct: scope1,
      scope2_reduction_pct: scope2,
      scope3_reduction_pct: scope3,
    }),
  exportUrl: (year?: string) =>
    `${BASE}/policy/export.csv${year ? `?year=${encodeURIComponent(year)}` : ''}`,
}
