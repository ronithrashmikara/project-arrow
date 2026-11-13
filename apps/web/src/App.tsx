import { NavLink, Route, Routes } from 'react-router-dom'
import CategoryPage from './features/policy/CategoryPage'
import DistrictPage from './features/policy/DistrictPage'
import ExportPage from './features/policy/ExportPage'
import LeaderboardPage from './features/policy/LeaderboardPage'
import OverviewPage from './features/policy/OverviewPage'
import PathwayPage from './features/policy/PathwayPage'
import ReportPage from './features/policy/ReportPage'

const NAV_ITEMS = [
  { to: '/policy', label: 'National overview', end: true },
  { to: '/policy/district', label: 'By district' },
  { to: '/policy/category', label: 'By category' },
  { to: '/policy/leaderboard', label: 'Leaderboard' },
  { to: '/policy/report', label: 'Baseline report' },
  { to: '/policy/export', label: 'Data export / API' },
  { to: '/policy/pathway', label: '2030 pathway' },
]

export default function App() {
  return (
    <div className="min-h-svh page-glow text-paper">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="topbar-surface sticky top-0 z-30 h-16">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="text-2xl leading-none text-fresh-emerald">
              ⬢
            </span>
            <span className="text-base font-semibold text-paper">
              Project Arrow — National dashboard
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              aria-label="Help and documentation"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-mountain-teal text-sm text-soft-sea-glass hover:text-paper"
            >
              ?
            </button>
            <span className="inline-flex h-8 items-center rounded-pill border border-mountain-teal bg-forest-shadow/60 px-3 text-xs font-medium text-luminous-mint">
              Gov / UN Analyst · read-only
            </span>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-mountain-teal bg-forest-shadow text-xs font-medium text-soft-sea-glass"
            >
              AS
            </span>
          </div>
        </div>
      </header>

      <div className="flex">
        <nav aria-label="Policy sections" className="sidebar-surface sticky top-16 h-[calc(100svh-4rem)] w-56 shrink-0 px-4 py-5">
          <ul className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    [
                      'relative flex h-10 items-center rounded-[10px] px-3 text-sm transition-colors',
                      isActive
                        ? 'bg-forest-shadow font-semibold text-paper'
                        : 'font-medium text-soft-sea-glass hover:bg-forest-shadow/50 hover:text-paper',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-electric-emerald"
                        />
                      ) : null}
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <p className="mt-8 border-t border-forest-shadow pt-4 text-[11px] leading-4 text-misty-blue-teal">
            Read-only analytics. No property identities, contacts or raw bills are exposed in this
            role.
          </p>
        </nav>

        <main id="main" className="min-w-0 flex-1 px-8 py-8">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/policy" element={<OverviewPage />} />
            <Route path="/policy/district" element={<DistrictPage />} />
            <Route path="/policy/category" element={<CategoryPage />} />
            <Route path="/policy/leaderboard" element={<LeaderboardPage />} />
            <Route path="/policy/report" element={<ReportPage />} />
            <Route path="/policy/export" element={<ExportPage />} />
            <Route path="/policy/pathway" element={<PathwayPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="glass-card px-6 py-8">
      <h2 className="text-lg font-semibold">Page not found</h2>
      <p className="mt-1 text-sm text-soft-sea-glass">Check the URL and try again.</p>
    </div>
  )
}
