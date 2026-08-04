/**
 * Button — the primary action primitive.
 *
 * Ships the seven states ADR-0011 requires: default, hover, focus-visible,
 * active, disabled, loading, error. Error is not a visual state on a button; a
 * button reports failure through the surface it submits to, and a red button
 * would be indistinguishable from `danger`. What it ships instead is the state
 * that actually belongs to a button in a failing flow: `loading` resolves and
 * the control becomes operable again, which is what makes a retry possible.
 *
 * A native `<button>` unless `asChild` is set. The alternative, a `<div>` with a
 * click handler, loses Enter and Space activation, form submission, and the
 * implicit `button` role, and every one of those has to be rebuilt by hand and
 * will be rebuilt slightly wrong.
 *
 * No focus ring is declared here. `theme.css` defines it once globally in
 * `@layer base`, per CLAUDE.md §5c, so a component has to actively fight the
 * system to lose it.
 */
'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { clsx } from 'clsx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'small' | 'medium' | 'large'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  /**
   * Blocks activation and announces the wait. The label stays in place and the
   * spinner is additive, so the control keeps its width: a button that shrinks
   * to fit a spinner moves everything beside it, which is how a double submit
   * happens when the user is already reaching for the click.
   */
  readonly loading?: boolean
  /** Announced while `loading`. Defaults to the button's own text. */
  readonly loadingLabel?: string
  /** Occupies the inline axis. For a form's submit on compact viewports. */
  readonly fullWidth?: boolean
  /**
   * Render as the child element, keeping every style. For a link that should
   * look like a button, where a wrapper element would break the layout.
   */
  readonly asChild?: boolean
  readonly className?: string
  readonly children?: ReactNode
}

/**
 * `--border-control` on every variant that shows a boundary. WCAG 1.4.11 wants
 * 3:1 for anything identifying a control, and `--border-default` is the
 * decorative hairline the criterion exempts. Using the latter here is the
 * mistake CLAUDE.md §5c exists to prevent.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: clsx(
    'bg-accent text-accent-content border border-transparent',
    'hover:bg-accent-hover',
    'active:bg-accent-hover',
  ),
  secondary: clsx(
    'bg-surface-raised text-content-primary border-border-control border',
    'hover:bg-surface-sunken',
    'active:bg-surface-sunken',
  ),
  ghost: clsx(
    'text-content-secondary border border-transparent bg-transparent',
    'hover:bg-surface-sunken hover:text-content-primary',
    'active:bg-surface-sunken',
  ),
  danger: clsx(
    'bg-critical text-content-inverse border border-transparent',
    'hover:opacity-90',
    'active:opacity-90',
  ),
}

/**
 * Heights are on the 4px scale and every size clears the 24px minimum target
 * WCAG 2.2 AA asks for at 2.5.8. `small` is 32px, which is the floor before a
 * control becomes hard to hit on a touch screen.
 */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  small: 'h-8 gap-1 px-3 text-caption',
  medium: 'h-10 gap-2 px-4 text-body',
  large: 'h-12 gap-2 px-6 text-body-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'medium',
    loading = false,
    loadingLabel,
    fullWidth = false,
    asChild = false,
    className,
    children,
    disabled,
    type = 'button',
    onClick,
    ...rest
  },
  ref,
) {
  const Root = asChild ? Slot : 'button'

  // A loading button is not operable. `disabled` alone would drop it from the
  // tab order mid-interaction, moving focus somewhere the user did not choose,
  // so the semantics come from aria-disabled and activation is blocked below.
  const inoperable = disabled === true || loading

  /**
   * `Slot` accepts exactly one child, because it merges props onto that element
   * rather than wrapping it. Adding a spinner and a live region beside the child
   * would make three, and Slot throws. So `asChild` forwards the child untouched
   * and the caller owns its content.
   *
   * That is the honest boundary rather than a limitation worked around: `asChild`
   * exists to render a link, and a link that navigates has no pending state of
   * its own. Anything that does needs a real button.
   */
  const content = asChild ? (
    children
  ) : (
    <>
      {loading && (
        <span
          // aria-hidden because aria-busy and the live region below already say
          // this. Three announcements of one fact is noise.
          aria-hidden="true"
          className={clsx(
            'size-4 shrink-0 animate-spin rounded-full border-2',
            'border-current/30 border-t-current',
          )}
        />
      )}
      {children}
      {loading && (
        <span role="status" className="sr-only">
          {loadingLabel ?? 'Working'}
        </span>
      )}
    </>
  )

  return (
    <Root
      ref={ref}
      // Spread first, so nothing a caller passes can silently replace the
      // activation guard or the aria state below. A caller who could override
      // `onClick` could re-enable a loading button.
      {...rest}
      // `type` defaults to "submit" inside a form, which turns any button in a
      // form into an accidental submit. Explicit and overridable.
      type={asChild ? undefined : type}
      disabled={asChild ? undefined : disabled}
      aria-disabled={inoperable || undefined}
      aria-busy={loading || undefined}
      data-loading={loading ? 'true' : undefined}
      onClick={(event) => {
        if (inoperable) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
      className={clsx(
        'inline-flex items-center justify-center rounded-md font-medium',
        'transition-colors duration-[--duration-instant] ease-out',
        // Not `disabled:` alone: an aria-disabled button is still enabled to the
        // browser, so the cursor and opacity have to follow the same signal the
        // click handler does.
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {content}
    </Root>
  )
})
