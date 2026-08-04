import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton, SkeletonText } from './Skeleton.js'

/**
 * Skeleton behaviour.
 *
 * Short, because the component is. The one thing that matters is the silence: a
 * placeholder that announces itself makes a screen reader read out a paragraph of
 * nothing while the real content is still loading.
 */

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    render(<Skeleton />)
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true')
  })

  it('announces nothing of its own', () => {
    // No role=status here. The status belongs to the region that is loading, not
    // to each grey rectangle inside it, or one loading table says "loading"
    // twenty times.
    render(<Skeleton />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('uses a surface token rather than a literal grey', () => {
    // Dark mode is authored, not inverted, so a hard-coded grey is right in one
    // theme and wrong in the other.
    render(<Skeleton />)
    expect(screen.getByTestId('skeleton').className).toContain('bg-surface-sunken')
  })

  it.each(['text', 'block', 'circle'] as const)('renders the %s shape', (shape) => {
    render(<Skeleton shape={shape} />)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })

  it('accepts sizing from the caller', () => {
    render(<Skeleton className="h-8 w-32" />)
    const element = screen.getByTestId('skeleton')

    expect(element.className).toContain('h-8')
    expect(element.className).toContain('w-32')
  })
})

describe('SkeletonText', () => {
  it('draws three lines by default', () => {
    render(<SkeletonText />)
    expect(screen.getAllByTestId('skeleton')).toHaveLength(3)
  })

  it('draws the number of lines asked for', () => {
    render(<SkeletonText lines={5} />)
    expect(screen.getAllByTestId('skeleton')).toHaveLength(5)
  })

  it('shortens the last line', () => {
    // A block of equal-length bars does not read as text, and the whole point is
    // that the eye recognises what is coming without reading anything.
    render(<SkeletonText lines={3} />)
    const lines = screen.getAllByTestId('skeleton')

    expect(lines[0]?.className).toContain('w-full')
    expect(lines[2]?.className).toContain('w-3/5')
  })

  it('hides every line from assistive technology', () => {
    render(<SkeletonText lines={4} />)
    for (const line of screen.getAllByTestId('skeleton')) {
      expect(line).toHaveAttribute('aria-hidden', 'true')
    }
  })
})
