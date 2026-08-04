/**
 * Skeleton — the loading state for a region whose shape is known.
 *
 * The design system rejects spinners for data surfaces: a spinner says "wait"
 * and nothing else, while a skeleton says what is arriving and where it will
 * be, which stops the layout jumping when it lands. A skeleton that does not
 * match the final layout is worse than a spinner, because it promises a shape
 * and then breaks the promise.
 *
 * `aria-hidden`, always. A screen reader gets the region's `aria-busy` and its
 * eventual content; announcing the placeholder itself would read out a paragraph
 * of nothing. The one thing assistive technology needs here is silence.
 *
 * No `role="status"` either, for the same reason. The status belongs on the
 * region that is loading, not on each grey rectangle inside it.
 */

import { clsx } from 'clsx'

export type SkeletonProps = {
  /**
   * Tailwind sizing classes. Defaults to a full-width line at body height, which
   * is the common case inside a text block.
   */
  readonly className?: string
  /** `text` rounds to the radius a line of type occupies. `block` is a panel. */
  readonly shape?: 'text' | 'block' | 'circle'
}

const SHAPE_CLASSES = {
  text: 'h-4 w-full rounded-sm',
  block: 'h-full w-full rounded-md',
  circle: 'aspect-square rounded-full',
} as const

export function Skeleton({ className, shape = 'text' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={clsx(
        // --surface-sunken, not a grey: the placeholder has to sit correctly on
        // both themes, and dark mode is authored rather than inverted.
        'bg-surface-sunken animate-pulse',
        SHAPE_CLASSES[shape],
        className,
      )}
    />
  )
}

export type SkeletonTextProps = {
  /** How many lines to draw. Match the paragraph being replaced. */
  readonly lines?: number
  readonly className?: string
}

/**
 * A paragraph placeholder. The last line is short, because a block of
 * equal-length bars does not read as text, and the point of a skeleton is that
 * the eye recognises what is coming without reading anything.
 */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? 'w-3/5' : 'w-full'} />
      ))}
    </div>
  )
}
