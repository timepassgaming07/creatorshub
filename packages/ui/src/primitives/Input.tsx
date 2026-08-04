/**
 * Input — the text field primitive.
 *
 * The label, the hint, and the error live here rather than at each call site,
 * because the wiring between them is the part that gets skipped. A field whose
 * error is a sibling `<p>` with no `aria-describedby` is invisible to a screen
 * reader: the user hears the field, submits it again, and is told nothing about
 * why it failed. Making that association impossible to forget is the reason this
 * component owns its label.
 *
 * `MoneyInput` deliberately does not build on this. Money parses to bigint minor
 * units on change and carries a currency affix, and collapsing the two would put
 * money-specific behaviour behind a general-purpose prop.
 *
 * No focus ring here. `theme.css` owns it globally, per CLAUDE.md §5c.
 */
'use client'

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { clsx } from 'clsx'

export type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'id' | 'aria-invalid' | 'aria-describedby'
> & {
  readonly label: string
  /**
   * Hides the label visually and keeps it for assistive technology. For a search
   * field in a toolbar whose purpose is obvious from context. A placeholder is
   * not a label: it disappears on the first keystroke, which leaves the user
   * with no way to check what they are filling in.
   */
  readonly labelHidden?: boolean
  /** Guidance shown before anything goes wrong. Replaced by `error`. */
  readonly hint?: string
  /**
   * Server or client validation failure. Sets `aria-invalid` and is announced,
   * because a visual-only error is no error for a screen-reader user.
   */
  readonly error?: string
  /** Blocks input and announces the wait, for a field being validated remotely. */
  readonly loading?: boolean
  /** Inside the control, before the field. A currency symbol or a URL prefix. */
  readonly prefix?: ReactNode
  /** Inside the control, after the field. A unit or a reveal toggle. */
  readonly suffix?: ReactNode
  readonly className?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    labelHidden = false,
    hint,
    error,
    loading = false,
    prefix,
    suffix,
    className,
    required = false,
    disabled = false,
    type = 'text',
    ...rest
  },
  ref,
) {
  const inputId = useId()
  const messageId = `${inputId}-message`

  const hasError = error !== undefined
  // The error replaces the hint rather than joining it. Two messages under one
  // field is a guess about which one applies now.
  const message = error ?? hint

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label
        htmlFor={inputId}
        className={clsx(
          'text-caption text-content-secondary font-medium',
          labelHidden && 'sr-only',
        )}
      >
        {label}
        {required && (
          <>
            {/* The asterisk is decoration; `required` on the input is the fact.
                Announcing both says "required required". */}
            <span aria-hidden="true" className="text-critical ml-1">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>

      <div
        className={clsx(
          'flex items-center gap-2 rounded-sm border px-3 py-2',
          'bg-surface-raised transition-colors duration-[--duration-instant] ease-out',
          // --border-control, not --border-default: this is the boundary of an
          // interactive control and WCAG 1.4.11 wants 3:1 for it.
          hasError ? 'border-critical' : 'border-border-control hover:border-border-strong',
          // focus-within moves the boundary, it does not draw a ring. The ring is
          // on the input itself and comes from theme.css.
          'focus-within:border-border-strong',
          disabled && 'bg-surface-sunken cursor-not-allowed opacity-60',
        )}
      >
        {prefix !== undefined && (
          <span aria-hidden="true" className="text-content-tertiary text-body shrink-0 select-none">
            {prefix}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          required={required}
          disabled={disabled || loading}
          aria-invalid={hasError || undefined}
          aria-describedby={message === undefined ? undefined : messageId}
          aria-busy={loading || undefined}
          {...rest}
          className={clsx(
            'text-content-primary placeholder:text-content-tertiary min-w-0 flex-1',
            // The border and background belong to the wrapper, so the control
            // reads as one object rather than a box inside a box.
            'bg-transparent outline-none',
            'disabled:cursor-not-allowed',
          )}
        />

        {loading && (
          <span
            aria-hidden="true"
            className="border-border-control border-t-accent size-4 shrink-0 animate-spin rounded-full border-2"
          />
        )}

        {suffix !== undefined && <span className="shrink-0">{suffix}</span>}
      </div>

      {message !== undefined && (
        <p
          id={messageId}
          // An error is announced when it appears; a hint is not, because a hint
          // is already read as part of the field's description.
          role={hasError ? 'alert' : undefined}
          className={clsx('text-caption', hasError ? 'text-critical' : 'text-content-tertiary')}
        >
          {message}
        </p>
      )}
    </div>
  )
})
