import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button.js'
import { ToastProvider, useToast, type ToastOptions } from './Toast.js'

/**
 * Toast behaviour.
 *
 * The point of interest is that a toast is announced at all, and that a failure
 * is announced differently from a success. A toast nobody hears is a toast that
 * did not happen, and for a screen-reader user that is the normal case unless the
 * live region is right.
 */

/** Raises a toast on demand, which is how a real call site uses this. */
function Harness({ options }: { readonly options: ToastOptions }) {
  const { show } = useToast()
  return <Button onClick={() => show(options)}>Raise</Button>
}

function renderWithProvider(options: ToastOptions) {
  return render(
    <ToastProvider>
      <Harness options={options} />
    </ToastProvider>,
  )
}

describe('Toast', () => {
  it('shows nothing until something raises one', () => {
    renderWithProvider({ title: 'Saved' })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('shows the title when raised', async () => {
    renderWithProvider({ title: 'Invitation sent' })

    await userEvent.click(screen.getByRole('button', { name: 'Raise' }))
    await waitFor(() => {
      expect(screen.getByText('Invitation sent')).toBeInTheDocument()
    })
  })

  it('shows the description alongside the title', async () => {
    renderWithProvider({
      title: 'Invitation sent',
      description: 'They have 7 days to accept.',
    })

    await userEvent.click(screen.getByRole('button', { name: 'Raise' }))
    await waitFor(() => {
      expect(screen.getByText('They have 7 days to accept.')).toBeInTheDocument()
    })
  })

  it('names the kind in text, so colour is not the only signal', async () => {
    // The design system requires that colour never carries meaning alone.
    // `success` and `critical` are otherwise the same shape in the same corner.
    renderWithProvider({ title: 'Invitation sent', variant: 'success' })

    await userEvent.click(screen.getByRole('button', { name: 'Raise' }))
    await waitFor(() => {
      expect(screen.getByText(/Success:/)).toBeInTheDocument()
    })
  })

  it('labels a failure as an error', async () => {
    renderWithProvider({ title: 'Could not send the invitation', variant: 'critical' })

    await userEvent.click(screen.getByRole('button', { name: 'Raise' }))
    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument()
    })
  })

  it('announces a failure assertively', async () => {
    // A failure interrupts, because the user has to act on it. Radix implements
    // that as an assertive live region rather than role=alert, so this asserts on
    // aria-live: looking for role=alert would fail while the announcement worked
    // perfectly, which is a test reporting on the wrong thing.
    renderWithProvider({ title: 'Could not send', variant: 'critical' })

    await userEvent.click(screen.getByRole('button', { name: 'Raise' }))
    await waitFor(() => {
      const live = document.querySelector('[aria-live="assertive"]')
      expect(live?.textContent).toContain('Could not send')
    })
  })

  it('announces a success politely', async () => {
    // Interrupting to say "it worked" is noise. A background toast waits for a
    // pause in whatever the screen reader is already saying.
    renderWithProvider({ title: 'Invitation sent', variant: 'success' })

    await userEvent.click(screen.getByRole('button', { name: 'Raise' }))
    await waitFor(() => {
      expect(screen.getByText('Invitation sent')).toBeInTheDocument()
    })

    expect(document.querySelector('[aria-live="assertive"]')).toBeNull()
  })

  it('can be dismissed', async () => {
    renderWithProvider({ title: 'Invitation sent' })

    await userEvent.click(screen.getByRole('button', { name: 'Raise' }))
    await waitFor(() => {
      expect(screen.getByText('Invitation sent')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => {
      expect(screen.queryByText('Invitation sent')).not.toBeInTheDocument()
    })
  })

  it('offers a single recovery action and calls it', async () => {
    const onAction = vi.fn()
    renderWithProvider({
      title: 'Could not send the invitation',
      variant: 'critical',
      action: { label: 'Try again', onAction },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Raise' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('shows several toasts at once', async () => {
    // Two failures raised in the same millisecond must not collide, which is why
    // the id is a counter rather than Date.now().
    function MultiHarness() {
      const { show } = useToast()
      return (
        <Button
          onClick={() => {
            show({ title: 'First' })
            show({ title: 'Second' })
          }}
        >
          Raise two
        </Button>
      )
    }

    render(
      <ToastProvider>
        <MultiHarness />
      </ToastProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Raise two' }))
    await waitFor(() => {
      expect(screen.getByText('First')).toBeInTheDocument()
    })
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('fails loudly when there is no provider', () => {
    // A confirmation that silently never appears is a bug that reaches
    // production precisely because it fails quietly.
    function Orphan() {
      useToast()
      return null
    }

    // React logs the error as well; the assertion is that it throws at all.
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/)
  })
})
