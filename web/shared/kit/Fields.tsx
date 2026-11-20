'use client'
import { cn } from '@/shared/lib/utils'

const base =
  'w-full h-9 rounded-lg border border-border bg-surface px-3 text-[13px] text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-background disabled:text-text-muted'

export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="block text-[12px] font-medium text-text-muted mb-1">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-[11.5px] text-text-disabled mt-1">{hint}</span>}
    </label>
  )
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string
  value: string | number | undefined | null
  onChange: (v: string) => void
  hint?: string
  wrapperClassName?: string
}

export function TextField({ label, value, onChange, hint, required, wrapperClassName, className, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} required={required} className={wrapperClassName}>
      <input
        {...rest}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={cn(base, className)}
      />
    </Field>
  )
}

export function NumberField(props: Omit<InputProps, 'type'>) {
  return <TextField {...props} type="number" step={props.step ?? 'any'} />
}

export function DateField(props: Omit<InputProps, 'type'>) {
  return <TextField {...props} type="date" />
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  wrapperClassName,
  disabled,
  title,
}: {
  label: string
  value: string | number | undefined | null
  onChange: (v: string) => void
  options: { value: string | number; label: string }[]
  placeholder?: string
  required?: boolean
  wrapperClassName?: string
  disabled?: boolean
  title?: string
}) {
  return (
    <Field label={label} required={required} className={wrapperClassName}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={base} disabled={disabled} title={title}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  hint,
  wrapperClassName,
}: {
  label: string
  value: string | undefined | null
  onChange: (v: string) => void
  rows?: number
  hint?: string
  wrapperClassName?: string
}) {
  return (
    <Field label={label} hint={hint} className={wrapperClassName}>
      <textarea
        rows={rows}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={cn(base, 'h-auto py-2 leading-snug')}
      />
    </Field>
  )
}

export function Btn({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'danger' | 'ghost'; size?: 'sm' | 'md' }) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-9 px-4 text-[13px]',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary-dark shadow-btn',
        variant === 'outline' && 'border border-border bg-surface text-text-secondary hover:bg-background',
        variant === 'danger' && 'bg-danger text-white hover:bg-red-700',
        variant === 'ghost' && 'text-text-secondary hover:bg-background',
        className
      )}
    >
      {children}
    </button>
  )
}
