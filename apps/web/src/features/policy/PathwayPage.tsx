import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorBox, Footnote, KpiCard, Panel, Spinner, YearSelect } from '../../components/ui'
import { policyApi, type PathwayResult } from '../../lib/api'

export default function PathwayPage() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [scope1, setScope1] = useState(10)
  const [scope2, setScope2] = useState(20)
  const [scope3, setScope3] = useState(5)
  const [result, setResult] = useState<PathwayResult | null>(null)
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
    policyApi
      .pathway(year || undefined, scope1, scope2, scope3)
      .then((data) => {
        if (!cancelled) setResult(data)
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
  }, [year, scope1, scope2, scope3])

  const comparison = result
    ? [
        { name: 'Baseline', total: result.baseline_total_kg },
        { name: 'Scenario', total: result.projected_total_kg },
      ]
    : []

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-paper">2030 pathway sandbox</h1>
          <p className="mt-1 text-[13px] leading-[18px] text-soft-sea-glass">
            Compare a national baseline against a reduction scenario. Indicative projections only.
          </p>
        </div>
        <YearSelect value={year} years={years} onChange={setYear} />
      </header>

      {error ? <ErrorBox message={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel title="Scenario assumptions" description="Reduction applied to each scope">
          <div className="space-y-5">
            <Slider id="scope1" label="Scope 1 reduction" value={scope1} onChange={setScope1} />
            <Slider id="scope2" label="Scope 2 reduction (grid electricity)" value={scope2} onChange={setScope2} />
            <Slider id="scope3" label="Scope 3 reduction (food, waste, laundry)" value={scope3} onChange={setScope3} />
            <p className="rounded-[10px] border border-forest-shadow bg-forest-shadow/40 px-3 py-2 text-[11px] text-misty-blue-teal">
              The scenario applies the same percentage reduction to every property, so relative
              differences between districts are preserved.
            </p>
          </div>
        </Panel>

        <div className="space-y-4">
          {loading ? (
            <Spinner label="Running scenario" />
          ) : result ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard label="Baseline" value={`${(result.baseline_total_kg / 1000).toFixed(1)}k`} unit="kg CO₂e" hairline="bg-misty-blue-teal" />
                <KpiCard label="Projected" value={`${(result.projected_total_kg / 1000).toFixed(1)}k`} unit="kg CO₂e" hairline="bg-luminous-mint" />
                <KpiCard
                  label="Avoided"
                  value={`${(result.avoided_kg / 1000).toFixed(1)}k`}
                  unit="kg CO₂e"
                  delta={`${result.reduction_pct.toFixed(1)}% below baseline`}
                  deltaColor="text-electric-emerald"
                  hairline="bg-electric-emerald"
                />
              </div>

              <Panel title="Baseline vs scenario" description="National total after reductions">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparison} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(37,84,84,0.35)" />
                    <XAxis dataKey="name" tick={{ fill: '#C4DDD1', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#C4DDD1', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(18,60,58,0.92)',
                        border: '1px solid #255454',
                        borderRadius: 10,
                        color: '#F8F9FB',
                      }}
                    />
                    <Bar dataKey="total" name="Total kg CO₂e" fill="#2BE38B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </>
          ) : null}
        </div>
      </div>

      <Footnote>
        Scenario figures are projections, not verified historical emissions. Every number is derived
        from the deterministic GHG engine.
      </Footnote>
    </div>
  )
}

function Slider({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-paper">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={0}
          max={60}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-2 w-full flex-1 cursor-pointer appearance-none rounded-full bg-forest-shadow accent-electric-emerald"
        />
        <output htmlFor={id} className="w-14 text-right text-sm font-semibold text-paper tabular-nums">
          {value}%
        </output>
      </div>
    </div>
  )
}
