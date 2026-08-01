/**
 * MoneyDisplay — the only way money is rendered.
 *
 * Design system §4: this primitive is non-negotiable and never bypassed. Every
 * revenue figure, price, commission, and refund in the product goes through it,
 * so that alignment, precision, and locale are decided once.
 *
 * Renders inside <data>, whose value attribute carries the exact minor units.
 * A screen reader gets the formatted text; a test or a scraper gets an
 * unambiguous machine value with no locale parsing required.
 */
import { isNegative, isZero, type Money } from '@creatorhub/contracts'
import { clsx } from 'clsx'
import { formatMoney, type FormatMoneyOptions } from './format.js'

export type MoneyDisplayProps = FormatMoneyOptions & {
  readonly value: Money
  /** Visual scale. `large` uses the numeric-lg token, for headline figures. */
  readonly size?: 'default' | 'large'
  /**
   * Colour negative amounts with the critical token. Refunds and clawbacks read
   * as distinct at a glance, per the design system's money rules.
   */
  readonly emphasiseNegative?: boolean
  /** Right-align, which is correct inside a table cell. */
  readonly align?: 'left' | 'right'
  readonly className?: string
}

export function MoneyDisplay({
  value,
  size = 'default',
  emphasiseNegative = true,
  align = 'left',
  className,
  ...formatOptions
}: MoneyDisplayProps) {
  const formatted = formatMoney(value, formatOptions)
  const negative = isNegative(value)

  return (
    <data
      value={value.amount.toString()}
      data-currency={value.currency}
      data-zero={isZero(value) ? 'true' : undefined}
      className={clsx(
        'tabular',
        size === 'large' ? 'text-numeric-lg' : 'text-numeric',
        align === 'right' && 'text-right',
        emphasiseNegative && negative ? 'text-critical' : 'text-content-primary',
        className,
      )}
    >
      {formatted}
    </data>
  )
}
