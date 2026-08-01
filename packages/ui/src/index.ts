/**
 * @creatorhub/ui — the design system.
 *
 * Tokens, primitives, and patterns. Appearance is ours; control behaviour follows
 * convention. See docs/design/design-system.md for the thesis and ADR-0011 for
 * why we build this layer rather than shipping a component library.
 *
 * Stylesheets are exported separately:
 *   import '@creatorhub/ui/styles.css'   // tokens + Tailwind theme
 *
 * Money primitives ship first because the design system makes them
 * non-negotiable: every price, revenue figure, and refund in the product goes
 * through them. Remaining primitives arrive with the slices that consume them.
 */
export { MoneyDisplay } from './money/MoneyDisplay.js'
export { MoneyInput } from './money/MoneyInput.js'
export { decimalSeparatorFor, formatMoney, parseMoneyInput, toInputValue } from './money/format.js'

export type { MoneyDisplayProps } from './money/MoneyDisplay.js'
export type { MoneyInputProps } from './money/MoneyInput.js'
export type { FormatMoneyOptions, ParseResult } from './money/format.js'
