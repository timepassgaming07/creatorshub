import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select, type SelectOption } from './Select.js'

/**
 * Select behaviour.
 *
 * These tests cover the contract, not the implementation: that the trigger is
 * named, that the keyboard opens and chooses, and that the error is associated.
 * Placement and scroll containment are deliberately absent, because jsdom has no
 * layout and the stubs in test-setup return zeroes. Asserting a position here
 * would be asserting against a stub. Playwright covers that in 1.11.
 */

const OPTIONS: readonly SelectOption[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
]

describe('Select', () => {
  it('renders a named trigger', () => {
    render(<Select label="Role" options={OPTIONS} />)

    // The trigger is a button, so a <label> would not name it. This passes only
    // if aria-labelledby points at the right element.
    expect(screen.getByRole('combobox', { name: /Role/ })).toBeInTheDocument()
  })

  it('shows the placeholder when nothing is chosen', () => {
    render(<Select label="Role" options={OPTIONS} placeholder="Choose a role" />)
    expect(screen.getByText('Choose a role')).toBeInTheDocument()
  })

  it('shows the label of the chosen value, not the value itself', () => {
    // A user should never see "member" where the interface promised "Member".
    render(<Select label="Role" options={OPTIONS} value="member" />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Member')
  })

  it('opens from the keyboard and reports the choice', async () => {
    const onValueChange = vi.fn()
    render(<Select label="Role" options={OPTIONS} onValueChange={onValueChange} />)

    await userEvent.tab()
    expect(screen.getByRole('combobox')).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => {
      expect(onValueChange).toHaveBeenCalled()
    })
  })

  it('closes on Escape without choosing', async () => {
    const onValueChange = vi.fn()
    render(<Select label="Role" options={OPTIONS} onValueChange={onValueChange} />)

    await userEvent.click(screen.getByRole('combobox'))
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('returns focus to the trigger when it closes', async () => {
    // Focus left somewhere undefined after a popup closes is how a keyboard user
    // loses their place in a form.
    render(<Select label="Role" options={OPTIONS} />)
    const trigger = screen.getByRole('combobox')

    await userEvent.click(trigger)
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(trigger).toHaveFocus()
    })
  })

  it('lists every option when open', async () => {
    render(<Select label="Role" options={OPTIONS} />)

    await userEvent.click(screen.getByRole('combobox'))
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Owner' })).toBeInTheDocument()
    })
    expect(screen.getByRole('option', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Member' })).toBeInTheDocument()
  })

  describe('error', () => {
    it('associates the message and marks the trigger invalid', () => {
      render(<Select label="Role" options={OPTIONS} error="Choose a role." />)
      const trigger = screen.getByRole('combobox')

      expect(trigger).toHaveAttribute('aria-invalid', 'true')
      expect(trigger).toHaveAccessibleDescription('Choose a role.')
    })

    it('announces the error', () => {
      render(<Select label="Role" options={OPTIONS} error="Choose a role." />)
      expect(screen.getByRole('alert')).toHaveTextContent('Choose a role.')
    })

    it('replaces the hint', () => {
      render(
        <Select label="Role" options={OPTIONS} hint="Owners can delete." error="Choose a role." />,
      )

      expect(screen.getByText('Choose a role.')).toBeInTheDocument()
      expect(screen.queryByText('Owners can delete.')).not.toBeInTheDocument()
    })
  })

  describe('disabled and loading', () => {
    it('cannot be opened when disabled', async () => {
      render(<Select label="Role" options={OPTIONS} disabled />)

      await userEvent.click(screen.getByRole('combobox'))
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('cannot be opened while loading, and says so', async () => {
      render(<Select label="Role" options={OPTIONS} loading />)
      const trigger = screen.getByRole('combobox')

      expect(trigger).toHaveAttribute('aria-busy', 'true')
      await userEvent.click(trigger)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })

  it('marks a required field as required', () => {
    render(<Select label="Role" options={OPTIONS} required />)
    expect(screen.getByText('(required)')).toBeInTheDocument()
  })

  it('bounds the trigger with the control token, not the decorative one', () => {
    render(<Select label="Role" options={OPTIONS} />)
    const { className } = screen.getByRole('combobox')

    expect(className).toContain('border-border-control')
    expect(className).not.toContain('border-border-default')
  })
})
