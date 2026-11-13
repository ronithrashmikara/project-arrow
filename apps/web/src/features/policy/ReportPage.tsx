import { useEffect, useState } from 'react'
import { Button, ErrorBox, Footnote, GlassCard, Panel, Pill, Spinner, YearSelect } from '../../components/ui'
import { policyApi, type BaselineReport } from '../../lib/api'

export default function ReportPage() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [report, setReport] = useState<BaselineReport | null>(null)
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
      .baselineReport(year || undefined)
      .then((data) => {
        if (!cancelled) setReport(data)
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

  const downloadText = () => {
    if (!report) return
    const body = report.sections.map((section) => `${section.heading.toUpperCase()}\n${section.body}`).join('\n\n')
    const blob = new Blob(
      [
        `Project Arrow - National baseline report\nReporting year: ${report.year}\n\n${body}\n\nDataset SHA-256: ${report.dataset_hash}\n`,
      ],
      { type: 'text/plain;charset=utf-8' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `project-arrow-baseline-${report.year.replace('/', '-')}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-paper">Baseline report</h1>
          <p className="mt-1 text-[13px] leading-[18px] text-soft-sea-glass">
            National baseline brief for {year || 'all reporting years'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <YearSelect value={year} years={years} onChange={setYear} />
          <Button variant="secondary" icon="⭳" onClick={downloadText} disabled={!report}>
            Download report
          </Button>
        </div>
      </header>

      {loading ? <Spinner label="Generating baseline report" /> : null}
      {error ? <ErrorBox message={error} /> : null}

      {report ? (
        <>
          <GlassCard className="px-8 py-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-forest-shadow pb-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-misty-blue-teal">
                  Project Arrow · National baseline
                </p>
                <h2 className="mt-1.5 text-xl font-semibold text-paper">
                  Sri Lanka tourist accommodation · FY {report.year}
                </h2>
                <p className="mt-1 text-sm text-soft-sea-glass">{report.generated_for}</p>
              </div>
              <Pill tone="mint" icon="✦">
                {report.badge}
              </Pill>
            </div>

            <div className="space-y-6 py-6">
              {report.sections.map((section) => (
                <section key={section.heading}>
                  <h3 className="text-sm font-semibold text-paper">{section.heading}</h3>
                  <p className="mt-1.5 max-w-3xl text-sm leading-6 text-soft-sea-glass">
                    {section.body}
                  </p>
                </section>
              ))}
            </div>

            <div className="border-t border-forest-shadow pt-5">
              <p className="text-[11px] uppercase tracking-wide text-misty-blue-teal">
                Dataset citation
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-soft-sea-glass">
                SHA-256 {report.dataset_hash}
              </p>
              <p className="mt-2 text-[11px] text-misty-blue-teal">
                {report.properties_reporting} properties reported · {report.suppressed_districts}{' '}
                district groups suppressed (k &lt; 5)
              </p>
            </div>
          </GlassCard>

          <Panel title="Report coverage" description="Category groups included in this brief">
            <ul className="grid gap-2 sm:grid-cols-2">
              {report.categories.map((category) => (
                <li
                  key={category.category}
                  className="flex items-center justify-between rounded-[10px] border border-forest-shadow bg-forest-shadow/40 px-3 py-2 text-sm"
                >
                  <span className="text-paper">{category.category}</span>
                  <span className="text-soft-sea-glass tabular-nums">
                    {category.suppressed
                      ? 'Suppressed'
                      : `${category.property_count} properties · median ${category.median}`}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Footnote>
            The prose in this brief is template-generated from deterministic engine figures. No
            language model writes or alters a number in this report.
          </Footnote>
        </>
      ) : null}
    </div>
  )
}
