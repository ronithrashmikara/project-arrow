import { useEffect, useState } from 'react'
import { ErrorBox, Footnote, LockBadge, Panel, Spinner, YearSelect } from '../../components/ui'
import { policyApi, type CategoryStat } from '../../lib/api'
import BoxPlot from './charts/BoxPlot'

export default function CategoryPage() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [categories, setCategories] = useState<CategoryStat[]>([])
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
      .categoryStats(year || undefined)
      .then((data) => {
        if (!cancelled) setCategories(data)
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

  if (loading) return <Spinner label="Loading category data" />
  if (error) return <ErrorBox message={error} />

  const published = categories.filter((category) => !category.suppressed)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-paper">By category</h1>
          <p className="mt-1 text-[13px] leading-[18px] text-soft-sea-glass">
            SLTDA category groups · {year || 'all reporting years'}
          </p>
        </div>
        <YearSelect value={year} years={years} onChange={setYear} />
      </header>

      <Panel
        title="Distribution by category"
        description="Box = interquartile range, median line, whiskers to 1.5 × IQR, outliers beyond"
      >
        <BoxPlot data={categories} height={300} />
      </Panel>

      <Panel title="Category summary" bodyClassName="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Emissions summary per SLTDA category group</caption>
            <thead>
              <tr className="border-b border-forest-shadow text-[11px] uppercase tracking-wide text-soft-sea-glass">
                <th scope="col" className="px-5 py-3 font-medium">
                  Category
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Properties
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Min
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Q1
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Median
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Q3
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Max
                </th>
                <th scope="col" className="px-5 py-3 text-right font-medium">
                  Outliers
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.category} className="border-b border-forest-shadow/60 hover:bg-forest-shadow/50">
                  <th scope="row" className="px-5 py-3 font-medium text-paper">
                    {category.category}
                  </th>
                  {category.suppressed ? (
                    <td colSpan={7} className="px-5 py-3 text-right">
                      <LockBadge />
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-3 text-right text-paper tabular-nums">
                        {category.property_count}
                      </td>
                      <td className="px-3 py-3 text-right text-paper tabular-nums">{category.min}</td>
                      <td className="px-3 py-3 text-right text-paper tabular-nums">{category.q1}</td>
                      <td className="px-3 py-3 text-right text-luminous-mint tabular-nums">
                        {category.median}
                      </td>
                      <td className="px-3 py-3 text-right text-paper tabular-nums">{category.q3}</td>
                      <td className="px-3 py-3 text-right text-paper tabular-nums">{category.max}</td>
                      <td className="px-5 py-3 text-right text-sunset-gold tabular-nums">
                        {(category.outliers ?? []).length}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="text-[11px] text-misty-blue-teal">
        {published.length} of {categories.length} category groups meet the k ≥ 5 threshold.
      </p>

      <Footnote>
        Figures are estimates from versioned Sri Lankan emission factors and are not a certified
        audit.
      </Footnote>
    </div>
  )
}
