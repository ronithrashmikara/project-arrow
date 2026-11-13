import type { ReactNode } from 'react'

export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

export function KpiCard({
  label,
  value,
  unit,
  hint,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <p className="text-sm font-medium text-ink-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink-900">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-ink-500">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <p role="status" aria-live="polite" className="py-8 text-center text-sm text-ink-500">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-600 align-[-2px] mr-2" />
      {label}…
    </p>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger-600 bg-red-50 px-4 py-3 text-sm text-danger-600"
    >
      <strong className="font-semibold">Could not load data. </strong>
      <span>{message}</span>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-sm text-ink-500">{message}</p>
  )
}

export function YearSelect({
  value,
  years,
  onChange,
}: {
  value: string
  years: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="reporting-year" className="text-sm font-medium text-ink-700">
        Reporting year
      </label>
      <select
        id="reporting-year"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
      >
        <option value="">All years</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  )
}
