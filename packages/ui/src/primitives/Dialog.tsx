/**
 * Dialog — a modal that interrupts on purpose.
 *
 * Radix supplies focus trapping, focus restored to the trigger, Escape to
 * dismiss, and a background hidden from assistive technology. ADR-0011 named
 * dialogs specifically as the kind of behaviour not worth rewriting, and focus
 * restoration is the reason: get it wrong and a keyboard user who closes a dialog
 * is returned to the top of the document, having lost their place entirely.
 *
 * The background is hidden by `aria-hidden` on the dialog's siblings rather than
 * by `aria-modal` on the dialog itself. That is the more thorough of the two, and
 * the reason the test asserts on the siblings: asserting `aria-modal` would have
 * passed against an implementation that hid nothing.

 *
 * `title` is a required prop rather than a slot, because a dialog with no
 * accessible name is announced as "dialog" and nothing else. Making it a
 * parameter means it cannot be left out.
 *
 * A destructive confirmation is composed rather than configured: pass a `danger`
 * Button in the footer and name the consequence in `description`. A `destructive`
 * flag would style the dialog and still let the copy say "Are you sure?", which
 * is the part the design system actually forbids.
 *
 * No focus ring here. `theme.css` owns it globally, per CLAUDE.md §5c.

 */
'use client'

import { type ReactNode } from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'
import { clsx } from 'clsx'

export type DialogProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /**
   * The control that opens the dialog, rendered in place.
   *
   * Passing it here rather than wiring `onClick` yourself is what makes focus
   * return to it on close. Radix restores focus to its own trigger; a button that
   * merely sets `open` is invisible to it, and closing returns the user to the
   * top of the document. Verified by the focus-restoration test, which fails
   * when this is omitted.
   *
   * Omit it for a dialog opened from somewhere that cannot hold a trigger, a
   * menu item or a keyboard shortcut, and restore focus at the call site.
   */
  readonly trigger?: ReactNode
  /** The accessible name. Rendered as the heading and wired to `aria-labelledby`. */
  readonly title: string

  /**
   * Wired to `aria-describedby`, so it is read after the title. The place to
   * name the consequence of a destructive action, per the design system: not
   * "Are you sure?" but what specifically is about to happen.
   */
  readonly description?: string
  readonly children?: ReactNode
  /** Actions. Rendered after the content, in the reading and tab order. */
  readonly footer?: ReactNode
  readonly size?: 'small' | 'medium' | 'large'
  /**
   * Hides the close affordance. For a dialog whose choice cannot be deferred,
   * where dismissing would leave the workflow in an undefined state. Escape and
   * the overlay still close it: removing every exit traps the user, which is a
   * worse failure than an ambiguous state.
   */
  readonly hideCloseButton?: boolean
  readonly className?: string
}

const SIZE_CLASSES = {
  small: 'max-w-sm',
  medium: 'max-w-lg',
  large: 'max-w-2xl',
} as const

function CloseIcon(): ReactNode {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  size = 'medium',
  hideCloseButton = false,
  className,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {/* asChild, so the caller's own Button is the trigger rather than being
          wrapped in a second one. Radix needs to own this element to return
          focus to it on close. */}
      {trigger !== undefined && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}

      <RadixDialog.Portal>
        <RadixDialog.Overlay
          // The scrim is the one place a literal colour is correct: it is not a
          // surface, it is an absence of one, and no semantic token names "the
          // page, dimmed". Expressed in oklch like every value in tokens.css
          // rather than as a hex, which the token test forbids outright.
          className="fixed inset-0 z-40 bg-[oklch(0%_0_0_/_0.45)]"
        />

        <RadixDialog.Content
          className={clsx(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-var(--space-8))]',
            '-translate-x-1/2 -translate-y-1/2',
            SIZE_CLASSES[size],
            'bg-surface-overlay border-border-default rounded-lg border',
            'shadow-elevation-3',
            // Capped so a long dialog scrolls its own body rather than the page
            // behind it, which on a compact viewport puts the actions out of reach.
            'flex max-h-[calc(100vh-var(--space-16))] flex-col',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 p-6 pb-0">
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="text-title text-content-primary font-display">
                {title}
              </RadixDialog.Title>
              {description !== undefined && (
                <RadixDialog.Description className="text-body text-content-secondary">
                  {description}
                </RadixDialog.Description>
              )}
            </div>

            {!hideCloseButton && (
              <RadixDialog.Close
                // An icon-only control needs an accessible name, and "Close" is
                // the conventional one. A bare × is announced as "times".
                aria-label="Close"
                className={clsx(
                  'text-content-tertiary hover:text-content-primary hover:bg-surface-sunken',
                  '-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm',
                  'transition-colors duration-[--duration-instant] ease-out',
                )}
              >
                <CloseIcon />
              </RadixDialog.Close>
            )}
          </div>

          {children !== undefined && (
            <div className="text-body text-content-primary overflow-y-auto p-6">{children}</div>
          )}

          {footer !== undefined && (
            <div className="border-border-subtle flex items-center justify-end gap-2 border-t p-6">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

/**
 * Closes the surrounding dialog when activated. Use with `Button asChild` so the
 * action gets button styling and dialog behaviour without a wrapper element.
 */
export const DialogClose = RadixDialog.Close
