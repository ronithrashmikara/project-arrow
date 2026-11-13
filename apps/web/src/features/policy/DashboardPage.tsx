import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState, ErrorBox, KpiCard, Panel, Spinner, YearSelect } from '../../components/ui'
import { policyApi, type DistrictStat, type SegmentStat, type Summary, type TrendPoint } from '../../lib/api'

const SCOPE_COLOURS = ['#15803d', '#1d4ed8', '#b45309']

export default function DashboardPage() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [districts, setDistricts] = useState<DistrictStat[]>([])
  const [segments, setSegments] = useState<SegmentStat[]>([])
  const [trends, setTrends] = useState<TrendPoint[]>([])
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
      policyApi.summary(year || undefined),
      policyApi.byDistrict(year || undefined),
      policyApi.bySegment(year || undefined),
      policyApi.trends(year || undefined),
    ])
      .then(([summaryData, districtData, segmentData, trendData]) => {
        if (cancelled) return
        setSummary(summaryData)
        setDistricts(districtData)
        setSegments(segmentData)
        setTrends(trendData)
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

  const scopeData = summary
    ? [
        { scope: 'Scope 1 · Direct', kg: summary.scope1_kg },
        { scope: 'Scope 2 · Electricity', kg: summary.scope2_kg },
        { scope: 'Scope 3 · Indirect', kg: summary.scope3_kg },
      ]
    : []

  const topDistricts = districts.filter((district) => !district.suppressed).slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">National overview</h2>
          <p className="text-sm text-ink-500">
            Aggregated verified submissions for {year || 'all reporting years'}.
          </p>
        </div>
        <YearSelect value={year} years={years} onChange={setYear} />
      </div>

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total emissions"
            value={formatKg(summary.total_kg)}
            unit="kg CO₂e"
            hint="Verified submissions only"
          />
          <KpiCard
            label="Emission intensity"
            value={summary.kg_per_guest_night.toFixed(2)}
            unit="kg CO₂e / guest night"
            hint="Headline national KPI"
          />
          <KpiCard
            label="Guest nights"
            value={summary.guest_nights.toLocaleString()}
            hint="Denominator for the intensity KPI"
          />
          <KpiCard
            label="Contributing properties"
            value={summary.property_count.toLocaleString()}
            hint="Groups below 5 are suppressed"
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Emissions by scope" description="Scope 1, 2 and 3 split (kg CO₂e)">
          {scopeData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={scopeData} layout="vertical" margin={{ left: 24, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fill: '#334155', fontSize: 12 }} />
                <YAxis type="category" dataKey="scope" width={140} tick={{ fill: '#334155', fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="kg" radius={[0, 6, 6, 0]}>
                  {scopeData.map((entry, index) => (
                    <Cell key={entry.scope} fill={SCOPE_COLOURS[index]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No data for the selected year." />
          )}
        </Panel>

        <Panel
          title="Monthly trend"
          description="National totals by month, with the per-guest-night intensity"
        >
          {trends.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trends} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: '#334155', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fill: '#334155', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#334155', fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="total_kg"
                  name="Total kg CO₂e"
                  stroke="#15803d"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="kg_per_guest_night"
                  name="kg / guest night"
                  stroke="#b45309"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No trend data for the selected year." />
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Districts by total emissions" description="Top 10 districts, verified data">
          {topDistricts.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={topDistricts}
                layout="vertical"
                margin={{ left: 24, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fill: '#334155', fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="district"
                  width={120}
                  tick={{ fill: '#334155', fontSize: 12 }}
                />
                <Tooltip />
                <Bar dataKey="total_kg" fill="#1d4ed8" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No district data available." />
          )}
        </Panel>

        <Panel title="Segments" description="Emissions per property segment (hotel category)">
          {segments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Aggregated emissions by property segment for the selected reporting year
                </caption>
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-500">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Segment
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">
                      Properties
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">
                      Total kg CO₂e
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      kg / guest night
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((segment) => (
                    <tr key={segment.segment} className="border-b border-line last:border-0">
                      <th scope="row" className="py-2 pr-4 font-medium text-ink-900">
                        {segment.segment}
                      </th>
                      <td className="py-2 pr-4 text-right">
                        {segment.suppressed ? '—' : segment.property_count}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {segment.suppressed ? 'Suppressed' : formatKg(segment.total_kg)}
                      </td>
                      <td className="py-2 text-right">
                        {segment.suppressed ? '—' : segment.kg_per_guest_night.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No segment data available." />
          )}
        </Panel>
      </div>
    </div>
  )
}

function formatKg(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} t`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toFixed(0)
}
