import type { ButtonHTMLAttributes, ReactNode } from 'react'

/*
  Shared UI primitives - "Midnight Jungle" dark theme.

  Contrast notes (WCAG 2.2 AA):
    paper #F8F9FB on midnight #040A05  -> 18.7:1
    soft-sea-glass #C4DDD1 on deep-forest -> 12.7:1
    electric-emerald #2BE38B on midnight  -> 11.7:1
    midnight on electric-emerald (button label) -> 11.7:1
    sunset-gold #F1C087 on midnight -> 11.8:1
    warm-copper #BE8144 on midnight -> 6.0:1
    misty-blue-teal #487674 -> 3.9:1, borders and icons ONLY, never body text.
*/

export function GlassCard({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return <Tag className={`glass-card ${className}`}>{children}</Tag>
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <GlassCard className={`flex flex-col overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-paper">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs leading-[18px] text-soft-sea-glass">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className={`px-5 pt-1 pb-5 ${bodyClassName}`}>{children}</div>
    </GlassCard>
  )
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaColor = 'text-electric-emerald',
  hairline = 'bg-electric-emerald',
  hint,
}: {
  label: string
  value: string
  unit?: string
  delta?: string
  deltaColor?: string
  hairline?: string
  hint?: string
}) {
  return (
    <GlassCard className="relative overflow-hidden px-4 py-4">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${hairline}`} />
      <p className="text-xs font-medium tracking-[0.2px] text-soft-sea-glass">{label}</p>
      <p className="mt-2 text-[32px] leading-9 font-semibold text-paper tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-soft-sea-glass">{unit}</span> : null}
      </p>
      {delta ? <p className={`mt-1 text-xs font-medium ${deltaColor}`}>{delta}</p> : null}
      {hint ? <p className="mt-1 text-[11px] text-misty-blue-teal">{hint}</p> : null}
    </GlassCard>
  )
}

export function Button({
  variant = 'secondary',
  icon,
  children,
  className = '',
  ...rest
}: {
  variant?: 'primary' | 'secondary' | 'ghost'
  icon?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'inline-flex h-11 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-colors'
  const styles = {
    primary:
      'bg-electric-emerald text-midnight shadow-[0_0_24px_rgba(43,227,139,0.28)] hover:bg-fresh-emerald',
    secondary:
      'border border-mountain-teal bg-forest-shadow/55 text-soft-sea-glass hover:border-misty-blue-teal hover:text-paper',
    ghost: 'text-luminous-mint hover:bg-forest-shadow/50',
  }[variant]

  return (
    <button type="button" className={`${base} ${styles} ${className}`} {...rest}>
      {icon ? (
        <span aria-hidden="true" className="text-[15px] leading-none">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  )
}

export function Pill({
  children,
  tone = 'mint',
  icon,
}: {
  children: ReactNode
  tone?: 'mint' | 'copper' | 'gold'
  icon?: ReactNode
}) {
  const tones = {
    mint: 'border-mountain-teal bg-forest-shadow/60 text-luminous-mint',
    copper: 'border-warm-copper/60 bg-warm-copper/10 text-warm-copper',
    gold: 'border-sunset-gold/50 bg-sunset-gold/10 text-sunset-gold',
  }[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium ${tones}`}
    >
      {icon ? (
        <span aria-hidden="true" className="text-[11px]">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <p role="status" aria-live="polite" className="py-10 text-center text-sm text-soft-sea-glass">
      <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-mountain-teal border-t-electric-emerald align-[-2px]" />
      {label}…
    </p>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-warm-copper/60 bg-warm-copper/10 px-4 py-3 text-sm text-warm-copper"
    >
      <strong className="font-semibold">Could not load data. </strong>
      <span>{message}</span>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="hatch-empty rounded-[10px] px-4 py-10 text-center text-sm text-soft-sea-glass">
      {message}
    </div>
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
      <label htmlFor="reporting-year" className="text-xs font-medium text-soft-sea-glass">
        Reporting year
      </label>
      <select
        id="reporting-year"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-h-11 rounded-[10px] border border-atmospheric-teal bg-forest-shadow/70 px-3 text-sm text-paper"
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

export function LockBadge({ label = 'Suppressed (k < 5)' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-warm-copper/60 bg-warm-copper/10 px-2.5 py-1 text-[11px] font-medium text-warm-copper">
      <span aria-hidden="true">🔒</span>
      {label}
    </span>
  )
}

export function Footnote({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-4 text-soft-sea-glass">{children}</p>
}
