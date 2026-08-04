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
 * Money primitives shipped first because the design system makes them
 * non-negotiable: every price, revenue figure, and refund in the product goes
 * through them. The core primitives followed once 1.11 gave them a real consumer,
 * so their shape follows a call site rather than a guess.
 */

export { MoneyDisplay } from './money/MoneyDisplay.js'
export { MoneyInput } from './money/MoneyInput.js'
export { decimalSeparatorFor, formatMoney, parseMoneyInput, toInputValue } from './money/format.js'

export type { MoneyDisplayProps } from './money/MoneyDisplay.js'
export type { MoneyInputProps } from './money/MoneyInput.js'
export type { FormatMoneyOptions, ParseResult } from './money/format.js'

/**
 * Core primitives. Every interactive one ships the seven states ADR-0011
 * requires: default, hover, focus-visible, active, disabled, loading, error.
 */
export { Button } from './primitives/Button.js'
export { Input } from './primitives/Input.js'
export { Select } from './primitives/Select.js'
export { Dialog, DialogClose } from './primitives/Dialog.js'
export { ToastProvider, useToast } from './primitives/Toast.js'
export { Skeleton, SkeletonText } from './primitives/Skeleton.js'

export type { ButtonProps, ButtonSize, ButtonVariant } from './primitives/Button.js'
export type { InputProps } from './primitives/Input.js'
export type { SelectOption, SelectProps } from './primitives/Select.js'
export type { DialogProps } from './primitives/Dialog.js'
export type { ToastOptions, ToastVariant } from './primitives/Toast.js'
export type { SkeletonProps, SkeletonTextProps } from './primitives/Skeleton.js'
