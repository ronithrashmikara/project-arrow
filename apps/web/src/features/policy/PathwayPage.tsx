import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorBox, Footnote, KpiCard, Panel, Spinner, YearSelect } from '../../components/ui'
import { policyApi, type PathwayResult } from '../../lib/api'
import { scenarioRepo, type Scenario } from '../../lib/repositories/scenarioRepository'
import { PageHeader } from '../../components/PageHeader'
import { useReportingYears } from '../../hooks/useReportingYears'

export default function PathwayPage() {
  const { years, year, setYear, error: yearsError } = useReportingYears()
  const [scope1, setScope1] = useState(10)
  const [scope2, setScope2] = useState(20)
  const [scope3, setScope3] = useState(5)
  const [result, setResult] = useState<PathwayResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- Saved Scenarios State ---
  const [savedScenarios, setSavedScenarios] = useState<Scenario[]>([])
  const [scenarioName, setScenarioName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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

  // Load saved scenarios on mount
  useEffect(() => {
    scenarioRepo.list().then(setSavedScenarios).catch(console.error)
  }, [])

  const comparison = result
    ? [
        { name: 'Baseline', total: result.baseline_total_kg },
        { name: 'Scenario', total: result.projected_total_kg },
      ]
    : []

  // --- CRUD Functions ---
  const handleSaveScenario = async () => {
    if (!scenarioName.trim()) {
      setSaveError('Please enter a name for the scenario.')
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      const newScenario = await scenarioRepo.create({
        name: scenarioName,
        year,
        scope1,
        scope2,
        scope3,
      })
      setSavedScenarios((prev) => [...prev, newScenario])
      setScenarioName('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save scenario')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLoadScenario = (scenario: Scenario) => {
    setYear(scenario.year)
    setScope1(scenario.scope1)
    setScope2(scenario.scope2)
    setScope3(scenario.scope3)
  }

  const handleDeleteScenario = async (id: string) => {
    if (confirm('Are you sure you want to delete this scenario?')) {
      await scenarioRepo.remove(id)
      setSavedScenarios((prev) => prev.filter((s) => s.id !== id))
    }
  }
const shownError = error ?? yearsError


  return (
    <div className="space-y-6">
      <PageHeader
        title="2030 pathway sandbox"
        subtitle="Compare a national baseline against a reduction scenario. Indicative projections only."
        actions={<YearSelect value={year} years={years} onChange={setYear} />}
      />

      {shownError ? <ErrorBox message={shownError} /> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel title="Scenario assumptions" description="Reduction applied to each scope">
          <div className="space-y-5">
            <Slider id="scope1" label="Scope 1 reduction" value={scope1} onChange={setScope1} />
            <Slider id="scope2" label="Scope 2 reduction (grid electricity)" value={scope2} onChange={setScope2} />
            <Slider id="scope3" label="Scope 3 reduction (food, waste, laundry)" value={scope3} onChange={setScope3} />
            
            {/* --- NEW UI BLOCK STARTS HERE --- */}
            <div className="pt-4 border-t border-forest-shadow space-y-3">
              <h3 className="text-sm font-medium text-paper">Saved Scenarios</h3>
              
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Scenario name..."
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  className="border border-atmospheric-teal bg-forest-shadow/60 rounded px-2 py-1 flex-1 text-sm text-paper placeholder:text-soft-sea-glass"
                />
                <button
                  onClick={handleSaveScenario}
                  disabled={isSaving}
                  className="bg-electric-emerald/20 text-electric-emerald border border-electric-emerald/50 px-3 py-1 rounded text-xs font-medium hover:bg-electric-emerald/30 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
              {saveError && <p className="text-red-400 text-xs">{saveError}</p>}

              {savedScenarios.length > 0 ? (
                <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {savedScenarios.map((s) => (
                    <li key={s.id} className="flex justify-between items-center bg-forest-shadow/40 p-2 rounded border border-forest-shadow/60">
                      <div className="overflow-hidden">
                        <span className="font-medium text-paper text-xs truncate block">{s.name}</span>
                        <span className="text-[10px] text-misty-blue-teal">
                          S1:{s.scope1}% S2:{s.scope2}% S3:{s.scope3}%
                        </span>
                      </div>
                      <div className="flex gap-2 ml-2">
                        <button
                          onClick={() => handleLoadScenario(s)}
                          className="text-luminous-mint text-[10px] hover:underline"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeleteScenario(s.id)}
                          className="text-sunset-gold text-[10px] hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-soft-sea-glass text-xs italic">No saved scenarios yet.</p>
              )}
            </div>
            {/* --- NEW UI BLOCK ENDS HERE --- */}

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