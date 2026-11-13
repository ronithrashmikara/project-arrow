import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, ErrorBox, Footnote, GlassCard, KpiCard, Panel, Pill, Spinner, YearSelect } from '../../components/ui'
import {
  policyApi,
  type CategoryStat,
  type DistrictHeatStat,
  type Overview,
  type Seasonality,
} from '../../lib/api'
import BoxPlot from './charts/BoxPlot'
import HeatMap from './charts/HeatMap'
import SeasonalityChart from './charts/SeasonalityChart'

export default function OverviewPage() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [districts, setDistricts] = useState<DistrictHeatStat[]>([])
  const [categories, setCategories] = useState<CategoryStat[]>([])
  const [season, setSeason] = useState<Seasonality | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    policyApi
      .periods()
      .then((data) => {
        setYears(data.reporting_years)
        const latest = data.reporting_years.at(-1)
        if (latest) setYear(latest)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      policyApi.overview(year || undefined),
      policyApi.districtStats(year || undefined),
      policyApi.categoryStats(year || undefined),
      policyApi.seasonality(year || undefined),
    ])
      .then(([overviewData, districtData, categoryData, seasonData]) => {
        if (cancelled) return
        setOverview(overviewData)
        setDistricts(districtData)
        setCategories(categoryData)
        setSeason(seasonData)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [year])

  if (loading) return <Spinner label="Loading national figures" />
  if (error) return <ErrorBox message={error} />

  const deltas = overview?.deltas ?? {}
  const totalDelta = deltas.total_kg_change_pct
  const medianDelta = deltas.median_intensity_change

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-paper">
            Sri Lanka tourist accommodation · FY {overview?.year}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] leading-[18px] text-soft-sea-glass">
            Anonymised · consented properties only · groups &lt; 5 hidden
            <Pill tone="copper" icon="🔒">
              k ≥ 5
            </Pill>
            {overview && overview.estimated_properties > 0 ? (
              <Pill tone="gold" icon="◔">
                {overview.estimated_properties} estimated
              </Pill>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <YearSelect value={year} years={years} onChange={setYear} />
          <a href={policyApi.exportUrl(year || undefined)} download>
            <Button variant="secondary" icon="⭳">
              Export CSV
            </Button>
          </a>
          <Link to="/policy/report">
            <Button variant="primary" icon="✦">
              Generate baseline report
            </Button>
          </Link>
        </div>
      </header>

      {overview ? (
        <section aria-label="Key performance indicators" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Properties reporting"
            value={overview.properties_reporting.toLocaleString()}
            delta={
              deltas.properties_vs_previous !== undefined
                ? `${deltas.properties_vs_previous >= 0 ? '+' : ''}${deltas.properties_vs_previous} vs ${deltas.previous_year}`
                : undefined
            }
            deltaColor="text-electric-emerald"
            hairline="bg-electric-emerald"
          />
          <KpiCard
            label="Total CO₂e"
            value={`${overview.total_co2e_tonnes.toLocaleString()} t`}
            delta={
              totalDelta !== undefined
                ? `${totalDelta <= 0 ? '↓' : '↑'} ${Math.abs(totalDelta)}% vs ${deltas.previous_year}`
                : undefined
            }
            deltaColor={totalDelta !== undefined && totalDelta <= 0 ? 'text-electric-emerald' : 'text-sunset-gold'}
            hairline="bg-fresh-emerald"
          />
          <KpiCard
            label="Median kg CO₂e / GN"
            value={overview.median_intensity.toFixed(1)}
            delta={
              medianDelta !== undefined
                ? `${medianDelta <= 0 ? '↓' : '↑'} ${Math.abs(medianDelta)} vs ${deltas.previous_year}`
                : undefined
            }
            deltaColor={medianDelta !== undefined && medianDelta <= 0 ? 'text-electric-emerald' : 'text-sunset-gold'}
            hairline="bg-luminous-mint"
          />
          <KpiCard
            label="Grid electricity share"
            value={`${overview.grid_share_pct}%`}
            delta="scope 2 driver"
            deltaColor="text-soft-sea-glass"
            hairline="bg-misty-blue-teal"
          />
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[664px_1fr]">
        <Panel
          title="Emissions intensity by district"
          description="Median kg CO₂e per guest night, consented properties only"
          className="min-h-[488px]"
          bodyClassName="flex-1"
        >
          <div className="h-[420px] w-full overflow-hidden rounded-[10px] border border-forest-shadow">
            <HeatMap districts={districts} />
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel
            title="By SLTDA category"
            description="Distribution of property intensity"
            bodyClassName="pt-0"
          >
            <BoxPlot data={categories} height={216} />
          </Panel>

          <Panel
            title="Peak vs off-season"
            description={`Peak ${season?.peak_average_intensity ?? '—'} vs off-peak ${
              season?.off_peak_average_intensity ?? '—'
            } kg CO₂e / guest night`}
            bodyClassName="pt-0"
          >
            {season ? <SeasonalityChart data={season} height={200} /> : null}
          </Panel>
        </div>
      </section>

      <GlassCard className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <p className="text-sm text-soft-sea-glass">
          {districts.filter((district) => !district.suppressed).length} of {districts.length} districts
          meet the k ≥ 5 publication threshold.
        </p>
        <Link
          to="/policy/district"
          className="text-sm font-medium text-luminous-mint underline-offset-4 hover:underline"
        >
          View district breakdown →
        </Link>
      </GlassCard>

      <Footnote>
        Read-only view. Figures are estimates from versioned Sri Lankan emission factors; groups
        smaller than 5 properties are suppressed (k ≥ 5).
      </Footnote>
    </div>
  )
}
