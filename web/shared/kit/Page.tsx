import { cn } from '@/shared/lib/utils'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h1 className="text-[20px] font-bold text-text-primary leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}

export function Card({
  title,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section className={cn('bg-surface border border-border rounded-card shadow-card-sm', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
          <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function ErrorBox({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-lg border border-danger-border bg-danger-light text-danger px-3.5 py-2.5 text-[13px] mb-3">
      {message}
    </div>
  )
}

export function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-primary-border bg-primary-light text-text-secondary px-3.5 py-2.5 text-[13px] mb-3">
      {children}
    </div>
  )
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="text-[12px] text-text-muted">{label}</div>
      <div
        className={cn(
          'text-[18px] font-bold mt-0.5',
          tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-text-primary'
        )}
      >
        {value}
      </div>
    </div>
  )
}

/** Cặp nhãn-giá trị cho màn chi tiết. */
export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-text-muted">{label}</dt>
      <dd className="text-[13.5px] text-text-primary mt-0.5 break-words">{children || <span className="text-text-disabled">—</span>}</dd>
    </div>
  )
}
