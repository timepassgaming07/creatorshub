import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button.js'

/**
 * Button behaviour.
 *
 * The loading tests are the ones worth having: that is where Button stops being
 * a thin wrapper over `<button>` and starts making decisions a caller could get
 * wrong.
 */

describe('Button', () => {
  it('renders a native button by default', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('is type=button unless told otherwise', () => {
    // Inside a form the platform default is "submit". A button that submits when
    // it was meant to open a menu is a data-loss bug, not a styling one.
    render(<Button>Open</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('can still be a submit button', () => {
    render(<Button type="submit">Send</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('calls onClick when activated', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)

    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is operable by keyboard with both Enter and Space', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)

    await userEvent.tab()
    expect(screen.getByRole('button')).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()

    await userEvent.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  describe('when loading', () => {
    it('announces the wait and blocks activation', async () => {
      const onClick = vi.fn()
      render(
        <Button loading onClick={onClick}>
          Save
        </Button>,
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-busy', 'true')
      expect(button).toHaveAttribute('aria-disabled', 'true')

      await userEvent.click(button)
      expect(onClick).not.toHaveBeenCalled()
    })

    it('stays in the tab order', async () => {
      // The reason for aria-disabled over disabled. A control that leaves the tab
      // order mid-interaction moves focus somewhere the user did not choose, and
      // they then have to work out where they landed.
      render(<Button loading>Save</Button>)

      await userEvent.tab()
      expect(screen.getByRole('button')).toHaveFocus()
    })

    it('blocks keyboard activation too, not only the pointer', async () => {
      const onClick = vi.fn()
      render(
        <Button loading onClick={onClick}>
          Save
        </Button>,
      )

      await userEvent.tab()
      await userEvent.keyboard('{Enter}')
      expect(onClick).not.toHaveBeenCalled()
    })

    it('keeps its label visible', () => {
      // A button whose text is replaced by a spinner loses the only clue about
      // what the user just triggered.
      render(<Button loading>Save changes</Button>)
      expect(screen.getByRole('button')).toHaveTextContent('Save changes')
    })

    it('announces a custom label when the button text is not a status', () => {
      render(
        <Button loading loadingLabel="Sending invitation">
          Invite
        </Button>,
      )
      expect(screen.getByRole('status')).toHaveTextContent('Sending invitation')
    })

    it('has no status region when it is not loading', () => {
      render(<Button>Save</Button>)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  describe('when disabled', () => {
    it('does not call onClick', async () => {
      const onClick = vi.fn()
      render(
        <Button disabled onClick={onClick}>
          Save
        </Button>,
      )

      await userEvent.click(screen.getByRole('button'))
      expect(onClick).not.toHaveBeenCalled()
    })

    it('is disabled to the platform, not only to aria', () => {
      render(<Button disabled>Save</Button>)
      expect(screen.getByRole('button')).toBeDisabled()
    })
  })

  describe('asChild', () => {
    it('renders as its child element', () => {
      // Why asChild exists: a link that looks like a button must still be a link,
      // so it opens in a new tab and is announced as a link.
      render(
        <Button asChild>
          <a href="/pricing">See pricing</a>
        </Button>,
      )

      expect(screen.getByRole('link', { name: 'See pricing' }).tagName).toBe('A')
    })

    it('does not put a type attribute on a non-button child', () => {
      // `type` on an anchor means something else entirely, and an invalid
      // attribute on a link only ever shows up in an audit.
      render(
        <Button asChild>
          <a href="/pricing">See pricing</a>
        </Button>,
      )
      expect(screen.getByRole('link')).not.toHaveAttribute('type')
    })
  })

  it('bounds the secondary variant with the control token, not the decorative one', () => {
    // WCAG 1.4.11 requires 3:1 for a control boundary. --border-default is the
    // decorative hairline the criterion exempts, so it is wrong here.
    render(<Button variant="secondary">Save</Button>)
    const { className } = screen.getByRole('button')

    expect(className).toContain('border-border-control')
    expect(className).not.toContain('border-border-default')
  })

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Button variant={variant}>Action</Button>)
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
    },
  )

  it.each(['small', 'medium', 'large'] as const)('renders the %s size', (size) => {
    render(<Button size={size}>Action</Button>)
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })
})
