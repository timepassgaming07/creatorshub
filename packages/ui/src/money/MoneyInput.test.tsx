import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { currency, money, type Money } from '@creatorhub/contracts'
import { MoneyInput } from './MoneyInput.js'

const GBP = currency('GBP')

/**
 * MoneyInput is a controlled component. A bare vi.fn() onChange never feeds the
 * new value back, so any behaviour that reads `value` after a change needs a real
 * state owner to test against.
 */
function Controlled({ initial = null }: { initial?: Money | null }) {
  const [value, setValue] = useState<Money | null>(initial)
  return (
    <MoneyInput label="Price" currency={GBP} value={value} onChange={setValue} locale="en-GB" />
  )
}

function setup(overrides: Partial<Parameters<typeof MoneyInput>[0]> = {}) {
  const onChange = vi.fn<(value: Money | null) => void>()
  const props = {
    label: 'Price',
    currency: GBP,
    value: null,
    onChange,
    locale: 'en-GB',
    ...overrides,
  }
  const view = render(<MoneyInput {...props} />)
  return { onChange, view, input: screen.getByLabelText(/price/i) }
}

describe('value handling', () => {
  it('emits exact minor units, never a float', async () => {
    const { onChange, input } = setup()
    await userEvent.type(input, '10.10')

    // The final call is the fully typed value. bigint means 1010n exactly —
    // the number 10.10 would be 10.100000000000001.
    expect(onChange).toHaveBeenLastCalledWith(money(1010n, GBP))
  })

  it('emits null when cleared, not zero', async () => {
    const { onChange, input } = setup({ value: money(1050n, GBP) })
    await userEvent.clear(input)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('displays an existing value in editable form without a symbol', () => {
    const { input } = setup({ value: money(1050n, GBP) })
    expect(input).toHaveValue('10.50')
  })

  it('keeps a partially typed amount visible', async () => {
    const { input } = setup()
    await userEvent.type(input, '10.')
    expect(input).toHaveValue('10.')
  })

  it('normalises to canonical form on blur', async () => {
    render(<Controlled />)
    const input = screen.getByLabelText(/price/i)
    await userEvent.type(input, '10.')
    await userEvent.tab()
    expect(input).toHaveValue('10.00')
  })

  it('keeps grouping and symbols out of the field after blur', async () => {
    render(<Controlled />)
    const input = screen.getByLabelText(/price/i)
    await userEvent.type(input, '£1,234.5')
    await userEvent.tab()
    expect(input).toHaveValue('1234.50')
  })

  it('shows the currency code beside the field', () => {
    setup()
    expect(screen.getByText('GBP')).toBeVisible()
  })
})

describe('validation', () => {
  it('rejects excess precision with a message rather than rounding', async () => {
    const { onChange, input } = setup()
    await userEvent.type(input, '10.005')

    expect(screen.getByText(/more decimal places/i)).toBeVisible()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // Crucially it did not silently emit 1001n or 1000n.
    expect(onChange).not.toHaveBeenCalledWith(money(1001n, GBP))
  })

  it('does not erase what the user typed when it is invalid', async () => {
    const { input } = setup()
    await userEvent.type(input, '10.005')
    expect(input).toHaveValue('10.005')
  })

  it('prefers a server error over a local parse error', () => {
    setup({ error: 'That price is below the minimum.' })
    expect(screen.getByText(/below the minimum/i)).toBeVisible()
  })

  it('links its message to the input for assistive technology', () => {
    setup({ hint: 'Buyers see this price at checkout.' })
    const input = screen.getByLabelText(/price/i)
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    expect(screen.getByText(/buyers see this price/i)).toHaveAttribute('id', describedBy)
  })
})

describe('the seven required states', () => {
  it('default renders an enabled, valid field', () => {
    const { input } = setup()
    expect(input).toBeEnabled()
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })

  it('focus-visible reaches the input by keyboard alone', async () => {
    const { input } = setup()
    await userEvent.tab()
    expect(input).toHaveFocus()
  })

  it('disabled blocks input and typing changes nothing', async () => {
    const { onChange, input } = setup({ disabled: true })
    expect(input).toBeDisabled()
    await userEvent.type(input, '10')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('loading exposes a status and blocks input', () => {
    const { input } = setup({ loading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(input).toBeDisabled()
  })

  it('error is announced through aria-invalid', async () => {
    const { input } = setup()
    await userEvent.type(input, 'abc')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('hover and active are style-only, so the field stays operable', async () => {
    const { input } = setup()
    await userEvent.hover(input)
    expect(input).toBeEnabled()
    await userEvent.click(input)
    expect(input).toHaveFocus()
  })
})

describe('accessibility', () => {
  it('associates the label with the input', () => {
    setup()
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument()
  })

  it('marks required fields without relying on the asterisk alone', () => {
    const { input } = setup({ required: true })
    expect(input).toBeRequired()
  })

  it('uses a decimal input mode rather than type=number', () => {
    const { input } = setup()
    expect(input).toHaveAttribute('inputMode', 'decimal')
    expect(input).toHaveAttribute('type', 'text')
  })

  it('gives each instance a unique id', () => {
    render(
      <>
        <MoneyInput label="Price" currency={GBP} value={null} onChange={vi.fn()} />
        <MoneyInput label="Compare at" currency={GBP} value={null} onChange={vi.fn()} />
      </>,
    )
    const first = screen.getByLabelText(/^price$/i)
    const second = screen.getByLabelText(/compare at/i)
    expect(first.id).not.toBe(second.id)
  })
})
