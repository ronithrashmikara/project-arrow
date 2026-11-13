import { useEffect, useMemo, useState } from 'react'
import { ErrorBox, Footnote, Panel, Pill, Spinner, YearSelect } from '../../components/ui'
import { policyApi, type LeaderboardEntry } from '../../lib/api'

const TIER_STYLE: Record<LeaderboardEntry['tier'], { text: string; ring: string; bg: string }> = {
  Leader: { text: 'text-electric-emerald', ring: 'border-electric-emerald/50', bg: 'bg-electric-emerald/10' },
  Good: { text: 'text-fresh-emerald', ring: 'border-fresh-emerald/50', bg: 'bg-fresh-emerald/10' },
  'Needs improvement': { text: 'text-sunset-gold', ring: 'border-sunset-gold/50', bg: 'bg-sunset-gold/10' },
}

export default function LeaderboardPage() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [groups, setGroups] = useState(0)
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
      .leaderboard(year || undefined)
      .then((data) => {
        if (cancelled) return
        setEntries(data.entries)
        setGroups(data.groups)
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

  const grouped = useMemo(() => {
    const map = new Map<string, LeaderboardEntry[]>()
    for (const entry of entries) {
      const key = `${entry.category_group} · ${entry.size_band}`
      map.set(key, [...(map.get(key) ?? []), entry])
    }
    return [...map.entries()]
  }, [entries])

  if (loading) return <Spinner label="Loading leaderboard" />
  if (error) return <ErrorBox message={error} />

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-paper">Leaderboard</h1>
          <p className="mt-1 text-[13px] leading-[18px] text-soft-sea-glass">
            Pseudonymised national ranking within category and size band
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone="mint">Identities hidden</Pill>
          <YearSelect value={year} years={years} onChange={setYear} />
        </div>
      </header>

      {grouped.length === 0 ? (
        <Panel title="No publishable groups">
          <p className="text-sm text-soft-sea-glass">
            Every category and size-band group fell below the k ≥ 5 threshold this year, so no
            ranking is published.
          </p>
        </Panel>
      ) : (
        grouped.map(([group, rows]) => (
          <Panel
            key={group}
            title={group}
            description={`${rows.length} properties · median ${rows[0]?.group_median ?? '—'} kg CO₂e / guest night`}
            bodyClassName="px-0 pb-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Pseudonymised ranking for {group}</caption>
                <thead>
                  <tr className="border-b border-forest-shadow text-[11px] uppercase tracking-wide text-soft-sea-glass">
                    <th scope="col" className="px-5 py-3 font-medium">
                      Rank
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Property
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">
                      kg CO₂e / GN
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">
                      Guest nights
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      Band
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const tier = TIER_STYLE[row.tier]
                    return (
                      <tr key={row.pseudonym} className="border-b border-forest-shadow/60 hover:bg-forest-shadow/50">
                        <td className="px-5 py-3 text-paper tabular-nums">{row.rank}</td>
                        <th scope="row" className="px-3 py-3 font-medium text-paper">
                          {row.pseudonym}
                        </th>
                        <td className="px-3 py-3 text-right text-paper tabular-nums">
                          {row.kg_per_guest_night}
                        </td>
                        <td className="px-3 py-3 text-right text-soft-sea-glass tabular-nums">
                          {row.guest_nights.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`inline-flex rounded-pill border px-2.5 py-1 text-[11px] font-medium ${tier.ring} ${tier.bg} ${tier.text}`}
                          >
                            {row.tier}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}

      <Footnote>
        {groups} group(s) published. Property names, contacts and raw bills are never exposed in
        this role; entries are ranked only where at least five properties consented to share.
      </Footnote>
    </div>
  )
}
