/**
 * Toast — a transient confirmation or failure notice.
 *
 * Exposed as a provider plus a hook rather than as a component, because a toast
 * is raised in response to something finishing, and the code that knows an
 * invitation was sent is not the code that renders. `useToast().show()` is what
 * 1.11 needs at the end of a submit handler.
 *
 * Radix supplies the swipe-to-dismiss, the hover-and-focus pause, the F8 hotkey
 * that jumps to the notification region, and the live-region semantics. The last
 * of those is the one worth naming: a toast that is not announced is a toast a
 * screen-reader user never receives, and the announcement has to be polite for a
 * success and assertive for a failure, or it either interrupts needlessly or
 * arrives too late to matter.
 *
 * Not for anything the user must act on. A toast disappears, so a required
 * decision belongs in a Dialog and a persistent condition belongs in a Banner.
 * Money is never confirmed by a toast alone: the design system says a payment
 * shows real state, and a notice that vanishes is not state.
 */
'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import * as RadixToast from '@radix-ui/react-toast'
import { clsx } from 'clsx'

export type ToastVariant = 'info' | 'success' | 'caution' | 'critical'

export type ToastOptions = {
  readonly title: string
  /** One sentence of detail. An error says what to do next, per CLAUDE.md §8. */
  readonly description?: string
  readonly variant?: ToastVariant
  /**
   * Milliseconds. A failure defaults to staying twice as long, because the user
   * has to read it rather than merely notice it.
   */
  readonly duration?: number
  /** A single recovery action. More than one is a Dialog. */
  readonly action?: {
    readonly label: string
    readonly onAction: () => void
  }
}

type QueuedToast = ToastOptions & { readonly id: number }

type ToastContextValue = {
  /** Raises a toast. Returns its id so a caller can dismiss it early. */
  readonly show: (options: ToastOptions) => number
  readonly dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Every variant pairs its colour with an icon and a word in the title. The
 * design system requires that colour never carries meaning alone, which matters
 * most here: `success` and `critical` are otherwise identical shapes in the same
 * corner of the screen.
 */
const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: 'border-info bg-info-subtle text-info',
  success: 'border-positive bg-positive-subtle text-positive',
  caution: 'border-caution bg-caution-subtle text-caution',
  critical: 'border-critical bg-critical-subtle text-critical',
}

/** The word a screen reader hears before the title, so the kind is never colour-only. */
const VARIANT_LABEL: Record<ToastVariant, string> = {
  info: 'Information',
  success: 'Success',
  caution: 'Warning',
  critical: 'Error',
}

const DEFAULT_DURATION = 5_000
const FAILURE_DURATION = 10_000

export function ToastProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<readonly QueuedToast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback((options: ToastOptions): number => {
    // Date.now would collide for two toasts raised in the same millisecond, which
    // is exactly what happens when a batch operation reports several failures.
    const id = nextToastId()
    setToasts((current) => [...current, { ...options, id }])
    return id
  }, [])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right">
        {children}

        {toasts.map((toast) => {
          const variant = toast.variant ?? 'info'
          const isFailure = variant === 'critical'

          return (
            <RadixToast.Root
              key={toast.id}
              duration={toast.duration ?? (isFailure ? FAILURE_DURATION : DEFAULT_DURATION)}
              // A failure interrupts; everything else waits for a pause. Radix maps
              // this onto aria-live and role under the hood.
              type={isFailure ? 'foreground' : 'background'}
              onOpenChange={(open) => {
                if (!open) dismiss(toast.id)
              }}
              className={clsx(
                'flex items-start gap-3 rounded-md border-l-4 p-4',
                'bg-surface-overlay shadow-elevation-2',
                'data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x)',
                VARIANT_CLASSES[variant],
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <RadixToast.Title className="text-body text-content-primary font-medium">
                  <span className="sr-only">{VARIANT_LABEL[variant]}: </span>
                  {toast.title}
                </RadixToast.Title>
                {toast.description !== undefined && (
                  <RadixToast.Description className="text-caption text-content-secondary">
                    {toast.description}
                  </RadixToast.Description>
                )}
              </div>

              {toast.action !== undefined && (
                <RadixToast.Action
                  // Radix requires this: it is the text a screen reader hears if
                  // the toast is dismissed before the action is reached.
                  altText={toast.action.label}
                  onClick={toast.action.onAction}
                  className={clsx(
                    'text-caption text-content-primary shrink-0 rounded-sm px-2 py-1 font-medium',
                    'border-border-control border',
                    'hover:bg-surface-sunken transition-colors duration-[--duration-instant]',
                  )}
                >
                  {toast.action.label}
                </RadixToast.Action>
              )}

              <RadixToast.Close
                aria-label="Dismiss"
                className={clsx(
                  'text-content-tertiary hover:text-content-primary shrink-0 rounded-sm',
                  'inline-flex size-6 items-center justify-center',
                  'transition-colors duration-[--duration-instant]',
                )}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-3.5">
                  <path
                    d="M12 4L4 12M4 4l8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </RadixToast.Close>
            </RadixToast.Root>
          )
        })}

        <RadixToast.Viewport
          // Bottom on compact, where the thumb is and where the top of the screen
          // is often covered by system chrome. Top-right from `regular` up, out of
          // the way of the content being worked on.
          className={clsx(
            'fixed z-50 flex max-h-screen w-full flex-col-reverse gap-2 p-4 outline-none',
            'bottom-0 left-0',
            'regular:top-0 regular:right-0 regular:bottom-auto regular:left-auto',
            'regular:max-w-sm regular:flex-col',
          )}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}

let toastCounter = 0
function nextToastId(): number {
  toastCounter += 1
  return toastCounter
}

/**
 * Raises toasts. Throws when no provider is above it, rather than silently doing
 * nothing: a confirmation that never appears is a bug that reaches production
 * precisely because it fails quietly.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (context === null) {
    throw new Error('useToast requires a <ToastProvider> ancestor.')
  }
  return context
}
