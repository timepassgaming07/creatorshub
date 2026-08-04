/**
 * Select — a single choice from a known list.
 *
 * Radix supplies the behaviour ADR-0011 declined to rewrite: typeahead, arrow
 * navigation, Home and End, Escape to close, focus returned to the trigger on
 * close, and the aria wiring between trigger and listbox. Every visual decision
 * is ours.
 *
 * The options are a prop rather than children. A select whose items are composed
 * by the caller invites two call sites that render an option differently, and the
 * point of a primitive is that they cannot. A grouped or richly formatted list is
 * a different component, and it can arrive when something needs one.
 *
 * A native `<select>` was the alternative. Rejected because its listbox cannot be
 * styled on any browser worth supporting, so the one control in the product that
 * ignores the design system would be the one users open most.
 *
 * No focus ring here. `theme.css` owns it globally, per CLAUDE.md §5c.
 */
'use client'

import { useId, type ReactNode } from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import { clsx } from 'clsx'

export type SelectOption = {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

export type SelectProps = {
  readonly label: string
  readonly labelHidden?: boolean
  readonly options: readonly SelectOption[]
  /** Controlled. `undefined` means nothing is chosen and the placeholder shows. */
  readonly value?: string
  readonly onValueChange?: (value: string) => void
  readonly placeholder?: string
  readonly hint?: string
  readonly error?: string
  readonly disabled?: boolean
  /** Blocks interaction while the options are being fetched. */
  readonly loading?: boolean
  readonly required?: boolean
  /** Submitted with the surrounding form. Radix renders a hidden native select. */
  readonly name?: string
  readonly className?: string
}

/** A chevron, drawn rather than imported: the icon family is not chosen yet. */
function ChevronIcon(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className="text-content-tertiary size-4 shrink-0"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon(): ReactNode {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 shrink-0">
      <path
        d="M13 4.5L6.5 11 3 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Select({
  label,
  labelHidden = false,
  options,
  value,
  onValueChange,
  placeholder = 'Select an option',
  hint,
  error,
  disabled = false,
  loading = false,
  required = false,
  name,
  className,
}: SelectProps) {
  const triggerId = useId()
  const labelId = `${triggerId}-label`
  const messageId = `${triggerId}-message`

  const hasError = error !== undefined
  const message = error ?? hint

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {/* A plain span, not a <label>. The trigger is a button, and a label
          pointing at a button is not a labelling relationship any screen reader
          honours. aria-labelledby on the trigger is what actually works. */}
      <span
        id={labelId}
        className={clsx(
          'text-caption text-content-secondary font-medium',
          labelHidden && 'sr-only',
        )}
      >
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-critical ml-1">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </span>

      <RadixSelect.Root
        // Spread rather than pass. `exactOptionalPropertyTypes` is on, and Radix
        // declares these as optional-but-not-undefined, so passing an explicit
        // `undefined` is a type error rather than an omission.
        {...(value === undefined ? {} : { value })}
        {...(onValueChange === undefined ? {} : { onValueChange })}
        {...(name === undefined ? {} : { name })}
        disabled={disabled || loading}
        required={required}
      >
        <RadixSelect.Trigger
          id={triggerId}
          aria-labelledby={labelId}
          aria-invalid={hasError || undefined}
          aria-describedby={message === undefined ? undefined : messageId}
          aria-busy={loading || undefined}
          className={clsx(
            'flex h-10 w-full items-center justify-between gap-2 rounded-sm border px-3',
            'bg-surface-raised text-body text-content-primary',
            'transition-colors duration-[--duration-instant] ease-out',
            // The control boundary, so --border-control and its 3:1.
            hasError ? 'border-critical' : 'border-border-control hover:border-border-strong',
            'data-[state=open]:border-border-strong',
            'disabled:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60',
            // Placeholder text is dimmer than a chosen value, so "nothing
            // selected" is visible without reading the words.
            'data-[placeholder]:text-content-tertiary',
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          {loading ? (
            <span
              aria-hidden="true"
              className="border-border-control border-t-accent size-4 shrink-0 animate-spin rounded-full border-2"
            />
          ) : (
            <RadixSelect.Icon>
              <ChevronIcon />
            </RadixSelect.Icon>
          )}
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            // `popper`, not `item-aligned`: an item-aligned listbox can cover the
            // trigger, which loses the user's place in a long list.
            position="popper"
            sideOffset={4}
            className={clsx(
              'bg-surface-overlay border-border-default z-50 overflow-hidden rounded-md border',
              'shadow-elevation-2',
              // Height is capped to the available space so a long list scrolls
              // instead of running off the viewport.
              'max-h-(--radix-select-content-available-height)',
              'w-(--radix-select-trigger-width)',
            )}
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled ?? false}
                  className={clsx(
                    'text-body text-content-primary relative flex cursor-default items-center',
                    'gap-2 rounded-sm py-2 pr-2 pl-8 select-none',
                    // Highlight follows keyboard and pointer alike, which Radix
                    // unifies under data-highlighted. Hover alone would leave a
                    // keyboard user unable to see where they are.
                    'data-highlighted:bg-accent-subtle data-highlighted:outline-none',
                    'data-disabled:pointer-events-none data-disabled:opacity-50',
                  )}
                >
                  <RadixSelect.ItemIndicator className="text-accent absolute left-2 inline-flex items-center">
                    <CheckIcon />
                  </RadixSelect.ItemIndicator>
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>

      {message !== undefined && (
        <p
          id={messageId}
          role={hasError ? 'alert' : undefined}
          className={clsx('text-caption', hasError ? 'text-critical' : 'text-content-tertiary')}
        >
          {message}
        </p>
      )}
    </div>
  )
}
