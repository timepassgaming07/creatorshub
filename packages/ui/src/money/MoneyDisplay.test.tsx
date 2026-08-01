import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { currency, money } from '@creatorhub/contracts'
import { MoneyDisplay } from './MoneyDisplay.js'

const GBP = currency('GBP')

describe('MoneyDisplay', () => {
  it('renders a formatted amount', () => {
    render(<MoneyDisplay value={money(1050n, GBP)} locale="en-GB" />)
    expect(screen.getByText('£10.50')).toBeVisible()
  })

  it('exposes exact minor units as a machine-readable value', () => {
    render(<MoneyDisplay value={money(1050n, GBP)} locale="en-GB" />)
    // A test or scraper reads 1050 without parsing a localised string.
    expect(screen.getByText('£10.50')).toHaveAttribute('value', '1050')
  })

  it('renders zero rather than a dash or blank', () => {
    render(<MoneyDisplay value={money(0n, GBP)} locale="en-GB" />)
    expect(screen.getByText('£0.00')).toBeVisible()
  })

  it('marks negative amounts distinctly', () => {
    render(<MoneyDisplay value={money(-1050n, GBP)} locale="en-GB" />)
    expect(screen.getByText('-£10.50')).toHaveClass('text-critical')
  })

  it('can leave negatives unemphasised where colour would mislead', () => {
    render(<MoneyDisplay value={money(-1050n, GBP)} locale="en-GB" emphasiseNegative={false} />)
    expect(screen.getByText('-£10.50')).not.toHaveClass('text-critical')
  })

  it('always uses tabular figures so columns align', () => {
    render(<MoneyDisplay value={money(1050n, GBP)} locale="en-GB" />)
    expect(screen.getByText('£10.50')).toHaveClass('tabular')
  })

  it('right-aligns when asked, for table cells', () => {
    render(<MoneyDisplay value={money(1050n, GBP)} locale="en-GB" align="right" />)
    expect(screen.getByText('£10.50')).toHaveClass('text-right')
  })

  it('records the currency for styling and assertions', () => {
    render(<MoneyDisplay value={money(1050n, GBP)} locale="en-GB" />)
    expect(screen.getByText('£10.50')).toHaveAttribute('data-currency', 'GBP')
  })

  it('shows the ISO code when several currencies can appear together', () => {
    render(<MoneyDisplay value={money(1050n, GBP)} locale="en-GB" showCurrencyCode />)
    expect(screen.getByText('£10.50 GBP')).toBeVisible()
  })
})
