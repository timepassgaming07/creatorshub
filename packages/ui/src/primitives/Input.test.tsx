import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './Input.js'

/**
 * Input behaviour.
 *
 * Almost every test here is about the label and error association, because that
 * is the whole reason this component exists rather than a bare `<input>`. A
 * field whose error is not programmatically associated is a field a
 * screen-reader user submits twice, learning nothing either time.
 */

describe('Input', () => {
  it('associates its label with the field', () => {
    render(<Input label="Email address" />)

    // getByLabelText resolves through the label association rather than by
    // proximity, so this fails if htmlFor and id ever drift apart.
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
  })

  it('generates a unique id per instance', () => {
    // Two fields with the same id means clicking the second label focuses the
    // first, which is silent and infuriating.
    render(
      <>
        <Input label="First name" />
        <Input label="Last name" />
      </>,
    )

    const first = screen.getByLabelText('First name')
    const last = screen.getByLabelText('Last name')
    expect(first.id).not.toBe(last.id)
  })

  it('accepts typing', async () => {
    render(<Input label="Email address" />)
    const field = screen.getByLabelText('Email address')

    await userEvent.type(field, 'alex@example.com')
    expect(field).toHaveValue('alex@example.com')
  })

  it('is reachable by keyboard', async () => {
    render(<Input label="Email address" />)

    await userEvent.tab()
    expect(screen.getByLabelText('Email address')).toHaveFocus()
  })

  describe('label visibility', () => {
    it('keeps a hidden label available to assistive technology', () => {
      // sr-only, not display:none. A visually hidden label is still a label; a
      // removed one leaves the field anonymous.
      render(<Input label="Search" labelHidden />)
      expect(screen.getByLabelText('Search')).toBeInTheDocument()
    })
  })

  describe('required', () => {
    it('marks the field required without announcing the asterisk twice', () => {
      render(<Input label="Email address" required />)
      const field = screen.getByLabelText(/Email address/)

      expect(field).toBeRequired()
      // The asterisk is aria-hidden and the word "required" carries the meaning,
      // so a screen reader says it once rather than "asterisk required".
      expect(screen.getByText('(required)')).toBeInTheDocument()
    })
  })

  describe('error', () => {
    it('associates the message with the field and marks it invalid', () => {
      render(<Input label="Email address" error="Enter a valid email address." />)
      const field = screen.getByLabelText('Email address')

      expect(field).toHaveAttribute('aria-invalid', 'true')
      // toHaveAccessibleDescription resolves aria-describedby, so this fails if
      // the id wiring breaks even while the text still renders.
      expect(field).toHaveAccessibleDescription('Enter a valid email address.')
    })

    it('announces the error when it appears', () => {
      render(<Input label="Email address" error="Enter a valid email address." />)
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.')
    })

    it('replaces the hint rather than showing both', () => {
      // Two messages under one field is a guess about which applies now.
      render(
        <Input
          label="Password"
          hint="At least 12 characters."
          error="That password is too short."
        />,
      )

      expect(screen.getByText('That password is too short.')).toBeInTheDocument()
      expect(screen.queryByText('At least 12 characters.')).not.toBeInTheDocument()
    })

    it('is not invalid when there is no error', () => {
      render(<Input label="Email address" />)
      expect(screen.getByLabelText('Email address')).not.toHaveAttribute('aria-invalid')
    })
  })

  describe('hint', () => {
    it('describes the field without raising an alert', () => {
      render(<Input label="Password" hint="At least 12 characters." />)

      expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
        'At least 12 characters.',
      )
      // A hint is not news. It is read as part of the field description, so
      // announcing it separately interrupts for no reason.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('loading', () => {
    it('blocks input and announces the wait', () => {
      render(<Input label="Workspace name" loading />)
      const field = screen.getByLabelText('Workspace name')

      expect(field).toBeDisabled()
      expect(field).toHaveAttribute('aria-busy', 'true')
    })
  })

  describe('disabled', () => {
    it('cannot be typed into', async () => {
      render(<Input label="Email address" disabled />)
      const field = screen.getByLabelText('Email address')

      await userEvent.type(field, 'hello')
      expect(field).toHaveValue('')
    })
  })

  it('renders a prefix and a suffix inside the control', () => {
    render(<Input label="Slug" prefix="creatorhub.com/" suffix={<span>.html</span>} />)

    expect(screen.getByText('creatorhub.com/')).toBeInTheDocument()
    expect(screen.getByText('.html')).toBeInTheDocument()
  })

  it('forwards arbitrary input attributes', () => {
    render(
      <Input
        label="Email address"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
      />,
    )
    const field = screen.getByLabelText('Email address')

    expect(field).toHaveAttribute('type', 'email')
    expect(field).toHaveAttribute('autocomplete', 'email')
    expect(field).toHaveAttribute('placeholder', 'you@example.com')
  })

  it('bounds the control with the control token, not the decorative one', () => {
    // WCAG 1.4.11: an input outline identifies a control and needs 3:1, so the
    // border belongs to --border-control. --border-default is the decorative
    // hairline the criterion exempts, and using it here is the mistake
    // CLAUDE.md §5c exists to prevent.
    render(<Input label="Email address" />)
    const bordered = screen.getByLabelText('Email address').parentElement

    expect(bordered?.className).toContain('border-border-control')
    expect(bordered?.className).not.toContain('border-border-default')
  })

  it('declares no focus ring of its own', () => {
    // CLAUDE.md §5c: focus is defined once, in theme.css. The wrapper may move
    // its border on focus-within, which is a border and not a ring.
    render(<Input label="Email address" />)
    const field = screen.getByLabelText('Email address')

    expect(field.className).not.toMatch(/focus-visible:/)
    expect(field.className).not.toMatch(/focus:ring/)
  })
})
