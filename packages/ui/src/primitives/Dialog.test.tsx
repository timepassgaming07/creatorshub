import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button.js'
import { Dialog, DialogClose } from './Dialog.js'

/**
 * Dialog behaviour.
 *
 * Focus management is the subject. A modal that does not trap focus lets the user
 * tab into a background they cannot see, and one that does not restore focus on
 * close returns a keyboard user to the top of the document. Both are silent for
 * a mouse user and disabling for everyone else, which is why they are tested
 * rather than assumed.
 */

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Dialog open={false} onOpenChange={vi.fn()} title="Invite a member" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is named by its title', () => {
    // A dialog with no accessible name is announced as "dialog" and nothing more.
    render(<Dialog open onOpenChange={vi.fn()} title="Invite a member" />)
    expect(screen.getByRole('dialog', { name: 'Invite a member' })).toBeInTheDocument()
  })

  it('is described by its description', () => {
    render(
      <Dialog
        open
        onOpenChange={vi.fn()}
        title="Refund £42.00"
        description="This revokes access to Summer Guide."
      />,
    )

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'This revokes access to Summer Guide.',
    )
  })

  it('hides the background from assistive technology', async () => {
    // One render, not two: separate render() calls produce sibling containers,
    // and the assertion would then depend on which container Radix happened to
    // mark rather than on the behaviour.
    render(
      <>
        <div data-testid="background">
          <p>Background content</p>
        </div>
        <Dialog open onOpenChange={vi.fn()} title="Invite a member" />
      </>,
    )

    // Radix hides the siblings rather than setting aria-modal on the dialog,
    // which is the more thorough of the two. Asserting aria-modal instead would
    // pass against an implementation that hid nothing at all, so this checks the
    // background itself.
    await waitFor(() => {
      expect(screen.getByTestId('background').closest('[aria-hidden="true"]')).not.toBeNull()
    })
  })

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn()
    render(<Dialog open onOpenChange={onOpenChange} title="Invite a member" />)

    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes from the close button', async () => {
    const onOpenChange = vi.fn()
    render(<Dialog open onOpenChange={onOpenChange} title="Invite a member" />)

    // Named "Close", not a bare ×, which is announced as "times".
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('can hide the close button for a decision that cannot be deferred', () => {
    render(<Dialog open onOpenChange={vi.fn()} title="Invite a member" hideCloseButton />)
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('still closes on Escape with the close button hidden', async () => {
    // Removing every exit traps the user, which is worse than an ambiguous state.
    const onOpenChange = vi.fn()
    render(<Dialog open onOpenChange={onOpenChange} title="Invite a member" hideCloseButton />)

    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders its content and footer', () => {
    render(
      <Dialog
        open
        onOpenChange={vi.fn()}
        title="Invite a member"
        footer={<Button>Send invitation</Button>}
      >
        <p>They will receive an email.</p>
      </Dialog>,
    )

    expect(screen.getByText('They will receive an email.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeInTheDocument()
  })

  it('moves focus into the dialog when it opens', async () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Invite a member" footer={<Button>Send</Button>}>
        <p>Body</p>
      </Dialog>,
    )

    // Focus inside the dialog, not left on the page behind it. Without this a
    // keyboard user has to hunt for the thing that just appeared.
    await waitFor(() => {
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    })
  })

  it('restores focus to the trigger when it closes', async () => {
    // The failure this prevents: close a dialog and land on <body>, with no idea
    // where you were. This is why `trigger` is a prop rather than a button the
    // caller wires up itself. An outside button that only sets `open` is invisible
    // to Radix, and this test fails against exactly that arrangement.
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          trigger={<Button>Invite</Button>}
          title="Invite a member"
          footer={
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
          }
        />
      )
    }

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Invite' })

    await userEvent.click(trigger)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(trigger).toHaveFocus()
    })
  })

  it('opens from its trigger', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          trigger={<Button>Invite</Button>}
          title="Invite a member"
        />
      )
    }

    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Invite a member' })).toBeInTheDocument()
    })
  })

  it('closes through DialogClose', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog
        open
        onOpenChange={onOpenChange}
        title="Invite a member"
        footer={
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
        }
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each(['small', 'medium', 'large'] as const)('renders at %s size', (size) => {
    render(<Dialog open onOpenChange={vi.fn()} title="Invite a member" size={size} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
