'use client'

/**
 * Application component kit, built on the design tokens.
 *
 * The primitives that carry real interaction semantics (Button, Input, Select,
 * Dialog, Toast) live in @creatorhub/ui with their tests. These are the
 * layout and display pieces every screen shares, so a table, a badge, or an
 * empty state looks and behaves the same everywhere.
 */
import {
  createContext,
  useContext,
  useId,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import Link from 'next/link'
import { Check, ChevronRight, CircleAlert, Copy, Loader2 } from 'lucide-react'

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export function LogoMark({ className = 'size-7' }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ch-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(78% 0.16 60)" />
          <stop offset="0.55" stopColor="oklch(62% 0.2 35)" />
          <stop offset="1" stopColor="oklch(52% 0.2 15)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#ch-mark)" />
      <path
        d="M21.5 10.6a7.4 7.4 0 1 0 0 10.8"
        fill="none"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="22.4" cy="16" r="2.1" fill="white" />
    </svg>
  )
}

export function Logo({
  href = '/',
  className,
  label = 'CreatorHub',
}: {
  readonly href?: string
  readonly className?: string
  readonly label?: string
}) {
  return (
    <Link
      href={href}
      className={cn('group inline-flex items-center gap-2.5 rounded-md', className)}
      aria-label={`${label} home`}
    >
      <LogoMark className="size-7 transition-transform duration-300 group-hover:rotate-[-8deg]" />
      <span className="text-[15px] font-semibold tracking-tight text-content-primary">{label}</span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  padded = true,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { readonly padded?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border-subtle bg-surface-raised hairline-glow',
        padded && 'p-5 sm:p-6',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
}) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-content-primary">{title}</h2>
        {description && <p className="mt-1 text-body text-content-secondary">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page framing
// ---------------------------------------------------------------------------

export type Crumb = { readonly label: string; readonly href?: string }

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
  eyebrow,
}: {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly actions?: ReactNode
  readonly crumbs?: readonly Crumb[]
  readonly eyebrow?: ReactNode
}) {
  return (
    <header className="mb-8">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-caption text-content-tertiary">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${String(index)}`} className="flex items-center gap-1">
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-content-primary">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-content-secondary">
                    {crumb.label}
                  </span>
                )}
                {index < crumbs.length - 1 && <ChevronRight className="size-3.5" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2">{eyebrow}</div>}
          <h1 className="text-title-lg font-semibold tracking-tight text-content-primary text-balance">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-body-lg text-content-secondary text-pretty">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Badges and status
// ---------------------------------------------------------------------------

export type Tone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-content-secondary border-border-subtle',
  accent: 'bg-accent-subtle text-accent border-transparent',
  positive: 'bg-positive-subtle text-positive border-transparent',
  caution: 'bg-caution-subtle text-caution border-transparent',
  critical: 'bg-critical-subtle text-critical border-transparent',
  info: 'bg-info-subtle text-info border-transparent',
}

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
  className,
}: {
  readonly tone?: Tone
  readonly children: ReactNode
  readonly dot?: boolean
  readonly className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  )
}

const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  paid: { label: 'Paid', tone: 'positive' },
  pending: { label: 'Pending', tone: 'neutral' },
  requires_payment: { label: 'Awaiting payment', tone: 'caution' },
  refunded: { label: 'Refunded', tone: 'info' },
  partially_refunded: { label: 'Part refunded', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'critical' },
  disputed: { label: 'Disputed', tone: 'critical' },
  fulfilled: { label: 'Fulfilled', tone: 'positive' },
}

export function OrderStatusBadge({ status }: { readonly status: string }) {
  const meta = ORDER_STATUS[status] ?? { label: status.replaceAll('_', ' '), tone: 'neutral' as const }
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  icon,
  trend,
  className,
}: {
  readonly label: string
  readonly value: ReactNode
  readonly hint?: ReactNode
  readonly icon?: ReactNode
  readonly trend?: { readonly direction: 'up' | 'down' | 'flat'; readonly label: string }
  readonly className?: string
}) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <div className="flex items-center justify-between">
        <p className="text-caption font-medium text-content-secondary">{label}</p>
        {icon && <span className="text-content-tertiary [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-3 text-[28px] leading-9 font-semibold tracking-tight text-content-primary tabular-nums">
        {value}
      </p>
      {(hint ?? trend) && (
        <div className="mt-1.5 flex items-center gap-2 text-caption text-content-tertiary">
          {trend && (
            <span
              className={cn(
                'font-medium',
                trend.direction === 'up' && 'text-positive',
                trend.direction === 'down' && 'text-critical',
              )}
            >
              {trend.label}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  readonly icon?: ReactNode
  readonly title: string
  readonly description?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border-default px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-raised text-content-secondary shadow-elevation-1 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-heading font-semibold text-content-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-body text-content-secondary text-pretty">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  detail,
  action,
}: {
  readonly title?: string
  readonly detail: ReactNode
  readonly action?: ReactNode
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-critical/25 bg-critical-subtle/40 px-6 py-12 text-center"
    >
      <CircleAlert className="mb-3 size-6 text-critical" aria-hidden="true" />
      <h3 className="text-heading font-semibold text-content-primary">{title}</h3>
      <p className="mt-1.5 max-w-md text-body text-content-secondary">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  readonly tone?: Exclude<Tone, 'neutral'>
  readonly title?: ReactNode
  readonly children?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
}) {
  return (
    <div
      role={tone === 'critical' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        tone === 'info' && 'border-info/20 bg-info-subtle',
        tone === 'accent' && 'border-accent/20 bg-accent-subtle',
        tone === 'positive' && 'border-positive/20 bg-positive-subtle',
        tone === 'caution' && 'border-caution/25 bg-caution-subtle',
        tone === 'critical' && 'border-critical/25 bg-critical-subtle',
        className,
      )}
    >
      <div className="min-w-0 text-body">
        {title && <p className="font-semibold text-content-primary">{title}</p>}
        {children && <div className="text-content-secondary">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Spinner({ className = 'size-4', label }: { readonly className?: string; readonly label?: string }) {
  return (
    <>
      <Loader2 className={cn('animate-spin', className)} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </>
  )
}

export function SkeletonBlock({ className }: { readonly className?: string }) {
  return <div className={cn('rounded-md bg-surface-sunken animate-shimmer', className)} aria-hidden="true" />
}

export function LoadingRows({ rows = 5 }: { readonly rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export function Avatar({
  label,
  className = 'size-8 text-[12px]',
}: {
  readonly label: string
  readonly className?: string
}) {
  const text = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent-subtle font-semibold text-accent',
        className,
      )}
    >
      {text || '?'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function Table({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-border-subtle bg-surface-raised', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-body">{children}</table>
    </div>
  )
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  readonly children?: ReactNode
  readonly className?: string
  readonly align?: 'left' | 'right'
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-border-subtle bg-surface-sunken/60 px-4 py-2.5 text-[12px] font-medium text-content-tertiary first:rounded-tl-xl last:rounded-tr-xl',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  readonly children?: ReactNode
  readonly className?: string
  readonly align?: 'left' | 'right'
}) {
  return (
    <td
      className={cn(
        'border-b border-border-subtle px-4 py-3 align-middle text-content-primary [tr:last-child_&]:border-b-0',
        align === 'right' && 'text-right tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  )
}

// ---------------------------------------------------------------------------
// Form helpers not covered by @creatorhub/ui
// ---------------------------------------------------------------------------

export function Textarea({
  label,
  hint,
  error,
  className,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  readonly label: string
  readonly hint?: string
  readonly error?: string
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-body font-medium text-content-primary">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-28 w-full rounded-md border bg-surface-raised px-3 py-2 text-body text-content-primary placeholder:text-content-tertiary',
          'transition-colors focus:outline-none focus-visible:border-border-strong',
          error ? 'border-critical' : 'border-border-control',
        )}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-caption text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-content-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
  readonly label: string
  readonly description?: string
  readonly disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-body font-medium text-content-primary">
          {label}
        </label>
        {description && <p className="mt-0.5 text-caption text-content-secondary">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          onCheckedChange(!checked)
        }}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
          checked ? 'border-transparent bg-accent' : 'border-border-control bg-surface-sunken',
        )}
      >
        <span
          className={cn(
            'inline-block size-4 rounded-full bg-surface-raised shadow-elevation-1 transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'medium',
}: {
  readonly value: T
  readonly onChange: (value: T) => void
  readonly options: readonly { readonly value: T; readonly label: ReactNode }[]
  readonly label: string
  readonly size?: 'small' | 'medium'
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-border-subtle bg-surface-sunken p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => {
            onChange(option.value)
          }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'small' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-caption',
            value === option.value
              ? 'bg-surface-raised text-content-primary shadow-elevation-1'
              : 'text-content-secondary hover:text-content-primary',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TabsContext = createContext<{ value: string; setValue: (v: string) => void; id: string } | null>(
  null,
)

export function Tabs({
  defaultValue,
  value: controlled,
  onValueChange,
  children,
  className,
}: {
  readonly defaultValue: string
  readonly value?: string
  readonly onValueChange?: (value: string) => void
  readonly children: ReactNode
  readonly className?: string
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const id = useId()
  const value = controlled ?? uncontrolled
  const setValue = (next: string) => {
    setUncontrolled(next)
    onValueChange?.(next)
  }
  return (
    <TabsContext.Provider value={{ value, setValue, id }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabList({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mb-6 flex gap-1 overflow-x-auto border-b border-border-subtle"
    >
      {children}
    </div>
  )
}

export function Tab({ value, children }: { readonly value: string; readonly children: ReactNode }) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tab must be inside Tabs')
  const selected = ctx.value === value
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.id}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${ctx.id}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => {
        ctx.setValue(value)
      }}
      className={cn(
        '-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-body font-medium whitespace-nowrap transition-colors',
        selected
          ? 'border-accent text-content-primary'
          : 'border-transparent text-content-secondary hover:text-content-primary',
      )}
    >
      {children}
    </button>
  )
}

export function TabPanel({ value, children }: { readonly value: string; readonly children: ReactNode }) {
  const ctx = useContext(TabsContext)
  if (!ctx || ctx.value !== value) return null
  return (
    <div role="tabpanel" id={`${ctx.id}-panel-${value}`} aria-labelledby={`${ctx.id}-tab-${value}`}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copy to clipboard
// ---------------------------------------------------------------------------

export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  readonly value: string
  readonly label?: string
  readonly className?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => {
            setCopied(false)
          }, 1600)
        })
      }}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-2.5 text-caption font-medium text-content-secondary transition-colors hover:text-content-primary',
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-positive" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      <span>{copied ? 'Copied' : label}</span>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Description list
// ---------------------------------------------------------------------------

export function DetailList({
  items,
}: {
  readonly items: readonly { readonly label: string; readonly value: ReactNode }[]
}) {
  return (
    <dl className="divide-y divide-border-subtle">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-6 py-2.5">
          <dt className="text-body text-content-secondary">{item.label}</dt>
          <dd className="min-w-0 text-right text-body font-medium text-content-primary break-words">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
