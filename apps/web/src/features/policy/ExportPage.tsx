import { useEffect, useState } from 'react'
import { Button, ErrorBox, Footnote, GlassCard, Panel, Pill, YearSelect } from '../../components/ui'
import { policyApi } from '../../lib/api'

export default function ExportPage() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [format, setFormat] = useState<'CSV' | 'JSON'>('CSV')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)

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

  const downloadJson = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/policy/district-stats${year ? `?year=${encodeURIComponent(year)}` : ''}`)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const data = await response.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `project-arrow-districts-${year || 'all'}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-paper">Data export / API</h1>
          <p className="mt-1 text-[13px] leading-[18px] text-soft-sea-glass">
            Anonymised district aggregates and the read-only partner API
          </p>
        </div>
        <YearSelect value={year} years={years} onChange={setYear} />
      </header>

      {error ? <ErrorBox message={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Export builder" description="Download the published district dataset">
          <div className="space-y-5">
            <div>
              <span className="text-xs font-medium text-soft-sea-glass">Format</span>
              <div className="mt-2 flex gap-2" role="group" aria-label="Export format">
                {(['CSV', 'JSON'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={format === option}
                    onClick={() => setFormat(option)}
                    className={[
                      'h-11 min-w-20 rounded-[10px] border px-4 text-sm font-medium transition-colors',
                      format === option
                        ? 'border-electric-emerald bg-electric-emerald/10 text-paper'
                        : 'border-atmospheric-teal bg-forest-shadow/60 text-soft-sea-glass hover:text-paper',
                    ].join(' ')}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[10px] border border-forest-shadow bg-forest-shadow/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-paper">k-anonymity floor</p>
                <p className="text-[11px] text-misty-blue-teal">
                  Groups below k = 5 are removed before export. This cannot be switched off.
                </p>
              </div>
              <Pill tone="mint" icon="🔒">
                Always on
              </Pill>
            </div>

            <div className="flex flex-wrap gap-3">
              {format === 'CSV' ? (
                <a href={policyApi.exportUrl(year || undefined)} download>
                  <Button variant="secondary" icon="⭳">
                    Download dataset
                  </Button>
                </a>
              ) : (
                <Button variant="secondary" icon="⭳" onClick={downloadJson} disabled={loading}>
                  {loading ? 'Preparing…' : 'Download dataset'}
                </Button>
              )}
              <Button
                variant="primary"
                icon="✦"
                onClick={() => setRequested(true)}
              >
                Request full release
              </Button>
            </div>

            {requested ? (
              <GlassCard className="border-luminous-mint/40 px-4 py-3 text-sm text-soft-sea-glass">
                <p className="font-medium text-paper">Full-release request logged</p>
                <p className="mt-1 text-[12px]">
                  A complete release is granted only after a signed data-use agreement and an
                  approval by the data controller. You will be notified once the request is
                  reviewed.
                </p>
              </GlassCard>
            ) : null}
          </div>
        </Panel>

        <Panel title="Read-only partner API" description="Documented endpoints for downstream use">
          <div className="space-y-3">
            {[
              { method: 'GET', path: '/policy/overview', note: 'National headline KPIs' },
              { method: 'GET', path: '/policy/district-stats', note: 'District aggregates (k ≥ 5)' },
              { method: 'GET', path: '/policy/category-stats', note: 'Category box-plot statistics' },
              { method: 'GET', path: '/policy/seasonality', note: 'Peak vs off-season series' },
              { method: 'GET', path: '/policy/leaderboard', note: 'Pseudonymised ranking' },
              { method: 'GET', path: '/policy/baseline-report', note: 'Baseline brief with hash' },
              { method: 'GET', path: '/policy/export.csv', note: 'Anonymised dataset download' },
            ].map((endpoint) => (
              <div
                key={endpoint.path}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-forest-shadow bg-forest-shadow/40 px-3 py-2"
              >
                <span className="font-mono text-[12px] text-luminous-mint">
                  {endpoint.method} {endpoint.path}
                </span>
                <span className="text-[12px] text-soft-sea-glass">{endpoint.note}</span>
              </div>
            ))}
            <p className="text-[12px] text-misty-blue-teal">
              Interactive documentation: <span className="font-mono">http://127.0.0.1:8000/docs</span>
            </p>
          </div>
        </Panel>
      </div>

      <Footnote>
        Exports contain district-level aggregates only. Property identities, contacts, evidence
        images and raw bills are never part of a policy or research export.
      </Footnote>
    </div>
  )
}
