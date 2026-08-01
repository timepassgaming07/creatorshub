/**
 * MoneyInput — the only way money is entered.
 *
 * Design system §4: "Input never accepts a float; it parses to bigint minor
 * units on change." That is the whole point of this component. A plain
 * <input type="number"> hands you a JavaScript number, and the first time a
 * creator prices something at £10.10 the value that reaches the server is
 * 10.100000000000001.
 *
 * Ships the seven required states: default, hover, focus-visible, active,
 * disabled, loading, error.
 *
 * Deliberately uses type="text" with inputMode="decimal". type="number" brings
 * spinners nobody wants on a price, silent locale disagreement about the decimal
 * mark, and a value property that is already a float by the time we see it.
 */
'use client'

import { useId, useState, type ChangeEvent, type FocusEvent } from 'react'
import { money, type CurrencyCode, type Money } from '@creatorhub/contracts'
import { clsx } from 'clsx'
import { decimalSeparatorFor, parseMoneyInput, toInputValue } from './format.js'

export type MoneyInputProps = {
  readonly label: string
  readonly currency: CurrencyCode
  readonly value: Money | null
  readonly onChange: (value: Money | null) => void
  readonly locale?: string
  readonly disabled?: boolean
  readonly loading?: boolean
  /** External error, from server validation. Takes precedence over local parse errors. */
  readonly error?: string
  readonly required?: boolean
  readonly hint?: string
  readonly name?: string
  readonly placeholder?: string
  readonly className?: string
}

const PARSE_MESSAGES: Record<'malformed' | 'too-precise', string> = {
  malformed: 'Enter an amount using digits, for example 10.50.',
  'too-precise': 'That is more decimal places than this currency uses.',
}

export function MoneyInput({
  label,
  currency: currencyCode,
  value,
  onChange,
  locale,
  disabled = false,
  loading = false,
  error,
  required = false,
  hint,
  name,
  placeholder,
  className,
}: MoneyInputProps) {
  const inputId = useId()
  const messageId = `${inputId}-message`

  // The raw string is local state so that partially typed input survives.
  // Deriving it from `value` on every render would erase "10." the moment the
  // user typed the separator, because "10." parses to the same amount as "10".
  const [draft, setDraft] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const displayed = draft ?? (value === null ? '' : toInputValue(value, locale))
  const message = error ?? parseError ?? hint
  const hasError = error !== undefined || parseError !== null

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value
    setDraft(next)

    if (next.trim() === '') {
      setParseError(null)
      onChange(null)
      return
    }

    const result = parseMoneyInput(next, currencyCode, locale)
    if (result.ok) {
      setParseError(null)
      onChange(money(result.minorUnits, currencyCode))
      return
    }

    // Report the failure but keep what the user typed. Rewriting the field
    // mid-keystroke is how input components become infuriating.
    setParseError(result.reason === 'empty' ? null : PARSE_MESSAGES[result.reason])
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>): void {
    // Normalise to canonical form on blur, once the user has finished. "10."
    // becomes "10.00", and stray grouping characters disappear.
    if (event.target.value.trim() === '') {
      setDraft(null)
      return
    }
    const result = parseMoneyInput(event.target.value, currencyCode, locale)
    if (result.ok) setDraft(null)
  }

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={inputId} className="text-caption text-content-secondary font-medium">
        {label}
        {required && (
          <span className="text-critical ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <div
        className={clsx(
          'flex items-center gap-2 rounded-sm border px-3 py-2 transition-colors',
          'duration-[--duration-instant] ease-out',
          'bg-surface-raised',
          hasError ? 'border-critical' : 'border-border-control hover:border-border-strong',
          disabled && 'bg-surface-sunken cursor-not-allowed opacity-60',
          'focus-within:border-border-strong',
        )}
      >
        <span aria-hidden="true" className="text-content-tertiary text-body select-none">
          {currencyCode}
        </span>

        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          // Guides mobile keyboards and rejects obvious nonsense before parsing.
          pattern={`[0-9]*[${decimalSeparatorFor(locale)}]?[0-9]*`}
          value={displayed}
          placeholder={placeholder}
          disabled={disabled || loading}
          required={required}
          aria-invalid={hasError}
          aria-describedby={message === undefined ? undefined : messageId}
          onChange={handleChange}
          onBlur={handleBlur}
          className={clsx(
            'tabular text-numeric flex-1 bg-transparent text-right outline-none',
            'text-content-primary placeholder:text-content-tertiary',
            'disabled:cursor-not-allowed',
          )}
        />

        {loading && (
          <span
            role="status"
            aria-label="Saving"
            className="border-border-control border-t-accent size-3 animate-spin rounded-full border-2"
          />
        )}
      </div>

      {message !== undefined && (
        <p
          id={messageId}
          className={clsx('text-caption', hasError ? 'text-critical' : 'text-content-tertiary')}
        >
          {message}
        </p>
      )}
    </div>
  )
}
