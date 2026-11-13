import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ErrorBox, KpiCard, Panel, Spinner, YearSelect } from '../../components/ui'
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
        { name: 'Baseline', scope1: result.baseline_total_kg, total: result.baseline_total_kg },
        { name: 'Scenario', scope1: result.scope1_kg, total: result.projected_total_kg },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">2030 pathway sandbox</h2>
          <p className="text-sm text-ink-500">
            Compare a national baseline against a reduction scenario. Projections are indicative,
            not policy commitments.
          </p>
        </div>
        <YearSelect value={year} years={years} onChange={setYear} />
      </div>

      {error ? <ErrorBox message={error} /> : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Panel title="Scenario assumptions" description="Reduction applied to each scope">
          <div className="space-y-5">
            <Slider
              id="scope1"
              label="Scope 1 reduction"
              value={scope1}
              onChange={setScope1}
            />
            <Slider
              id="scope2"
              label="Scope 2 reduction (grid electricity)"
              value={scope2}
              onChange={setScope2}
            />
            <Slider
              id="scope3"
              label="Scope 3 reduction (food, waste, laundry)"
              value={scope3}
              onChange={setScope3}
            />
            <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-500">
              Scenario applies the same percentage reduction to every property, so relative
              differences between districts are preserved.
            </p>
          </div>
        </Panel>

        <div className="space-y-6">
          {loading ? (
            <Spinner label="Running scenario" />
          ) : result ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard
                  label="Baseline"
                  value={`${(result.baseline_total_kg / 1000).toFixed(1)}k`}
                  unit="kg CO₂e"
                />
                <KpiCard
                  label="Projected"
                  value={`${(result.projected_total_kg / 1000).toFixed(1)}k`}
                  unit="kg CO₂e"
                />
                <KpiCard
                  label="Avoided"
                  value={`${(result.avoided_kg / 1000).toFixed(1)}k`}
                  unit="kg CO₂e"
                  hint={`${result.reduction_pct.toFixed(1)}% below baseline`}
                />
              </div>

              <Panel title="Baseline vs scenario" description="Scope 1, 2 and 3 after reductions">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparison} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#334155', fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" name="Total kg CO₂e" fill="#15803d" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </>
          ) : null}
        </div>
      </div>
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
      <label htmlFor={id} className="block text-sm font-medium text-ink-700">
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
          className="h-2 w-full flex-1 cursor-pointer appearance-none rounded-full bg-line"
        />
        <output htmlFor={id} className="w-14 text-right text-sm font-semibold text-ink-900">
          {value}%
        </output>
      </div>
    </div>
  )
}
