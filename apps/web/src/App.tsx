import { NavLink, Route, Routes } from 'react-router-dom'
import DashboardPage from './features/policy/DashboardPage'
import GisPage from './features/policy/GisPage'
import PathwayPage from './features/policy/PathwayPage'

const navItems = [
  { to: '/policy', label: 'National dashboard', end: true },
  { to: '/policy/gis', label: 'GIS emissions map' },
  { to: '/policy/pathway', label: '2030 pathway' },
]

export default function App() {
  return (
    <div className="min-h-svh bg-canvas text-ink-900">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-widest text-brand-600 uppercase">
              Project Arrow
            </p>
            <h1 className="text-xl font-semibold">National Emissions Dashboard</h1>
            <p className="text-sm text-ink-500">
              Policy Analyst module &middot; aggregated, anonymised national view
            </p>
          </div>

          <nav aria-label="Policy modules">
            <ul className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      [
                        'inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'border-brand-700 bg-brand-700 text-white'
                          : 'border-line bg-surface text-ink-700 hover:bg-canvas',
                      ].join(' ')
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Routes>
          <Route path="/" element={<NavigateToPolicy />} />
          <Route path="/policy" element={<DashboardPage />} />
          <Route path="/policy/gis" element={<GisPage />} />
          <Route path="/policy/pathway" element={<PathwayPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-ink-500 sm:px-6">
          <p>
            Figures are estimates derived from published emission factors and are not a certified
            carbon audit. Groups with fewer than 5 contributing properties are suppressed.
          </p>
        </div>
      </footer>
    </div>
  )
}

function NavigateToPolicy() {
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <p>Open the national dashboard:</p>
      <NavLink className="font-semibold text-accent-600 underline" to="/policy">
        /policy
      </NavLink>
    </div>
  )
}

function NotFound() {
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">Page not found</h2>
      <p className="text-sm text-ink-500">Check the URL and try again.</p>
    </div>
  )
}
