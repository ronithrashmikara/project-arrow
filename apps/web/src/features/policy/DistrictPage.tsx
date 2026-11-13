import { useEffect, useState } from 'react'
import { Button, ErrorBox, Footnote, LockBadge, Panel, Spinner, YearSelect } from '../../components/ui'
import { policyApi, type DistrictHeatStat } from '../../lib/api'
import { rampColour } from './charts/HeatMap'

export default function DistrictPage() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [districts, setDistricts] = useState<DistrictHeatStat[]>([])
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
    policyApi
      .districtStats(year || undefined)
      .then((data) => {
        if (!cancelled) setDistricts(data)
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

  if (loading) return <Spinner label="Loading district data" />
  if (error) return <ErrorBox message={error} />

  const published = districts.filter((district) => !district.suppressed)
  const max = published.length ? Math.max(...published.map((d) => d.median_intensity)) : 1
  const min = published.length ? Math.min(...published.map((d) => d.median_intensity)) : 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-paper">By district</h1>
          <p className="mt-1 text-[13px] leading-[18px] text-soft-sea-glass">
            District aggregates for {year || 'all reporting years'} · k ≥ 5 enforced
          </p>
        </div>
        <div className="flex items-center gap-4">
          <YearSelect value={year} years={years} onChange={setYear} />
          <a href={policyApi.exportUrl(year || undefined)} download>
            <Button variant="secondary" icon="⭳">
              Export CSV
            </Button>
          </a>
        </div>
      </header>

      <Panel
        title="District table"
        description="Median intensity drives the bar colour; suppressed groups are withheld by the API"
        bodyClassName="px-0 pb-0"
      >
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              District emissions aggregates for the selected reporting year
            </caption>
            <thead className="sticky top-0 bg-deep-forest/95 backdrop-blur">
              <tr className="border-b border-forest-shadow text-[11px] uppercase tracking-wide text-soft-sea-glass">
                <th scope="col" className="px-5 py-3 font-medium">
                  District
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Province
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Properties
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Guest nights
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Total kg CO₂e
                </th>
                <th scope="col" className="px-5 py-3 text-right font-medium">
                  Median kg CO₂e / GN
                </th>
              </tr>
            </thead>
            <tbody>
              {districts.map((district) => {
                const ratio = max === min ? 0 : (district.median_intensity - min) / (max - min)
                return (
                  <tr
                    key={district.district}
                    className="border-b border-forest-shadow/60 transition-colors hover:bg-forest-shadow/50"
                  >
                    <th scope="row" className="px-5 py-3 font-medium text-paper">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 rounded-full border border-mountain-teal"
                          style={{
                            background: district.suppressed
                              ? 'repeating-linear-gradient(45deg,#0C2B25 0 3px,rgba(72,118,116,0.35) 3px 6px)'
                              : rampColour(district.median_intensity, min, max),
                            opacity: district.suppressed ? 0.6 : 0.4 + ratio * 0.6,
                          }}
                        />
                        {district.district}
                      </span>
                    </th>
                    <td className="px-3 py-3 text-soft-sea-glass">{district.province}</td>
                    <td className="px-3 py-3 text-right text-paper tabular-nums">
                      {district.suppressed ? '—' : district.property_count}
                    </td>
                    <td className="px-3 py-3 text-right text-paper tabular-nums">
                      {district.suppressed ? '—' : district.guest_nights.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-paper tabular-nums">
                      {district.suppressed ? '—' : district.total_kg.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {district.suppressed ? (
                        <LockBadge />
                      ) : (
                        <span className="text-paper tabular-nums">{district.median_intensity}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Footnote>
        Rows marked “Suppressed (k &lt; 5)” contain fewer than five consenting properties. Their
        totals, guest nights and group size are withheld server-side and are never sent to the
        browser.
      </Footnote>
    </div>
  )
}
