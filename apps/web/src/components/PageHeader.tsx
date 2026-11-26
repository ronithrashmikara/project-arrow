import type { ReactNode } from 'react'

// One job: the title area at the top of every page.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] leading-7 font-semibold text-paper">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-[13px] leading-[18px] text-soft-sea-glass">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-4">{actions}</div> : null}
    </header>
  )
}