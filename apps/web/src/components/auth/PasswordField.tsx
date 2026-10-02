'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@creatorhub/ui'

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
  disabled,
  name = 'password',
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly autoComplete: 'current-password' | 'new-password'
  readonly error?: string | undefined
  readonly hint?: string | undefined
  readonly disabled?: boolean
  readonly name?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <Input
      label={label}
      name={name}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      required
      value={value}
      disabled={disabled}
      onChange={(e) => {
        onChange(e.target.value)
      }}
      {...(error ? { error } : {})}
      {...(hint ? { hint } : {})}
      suffix={
        <button
          type="button"
          onClick={() => {
            setVisible((v) => !v)
          }}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="flex size-7 items-center justify-center rounded text-content-tertiary hover:text-content-primary"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      }
    />
  )
}

/** A rough guide, not a gate: the server enforces 12 characters minimum. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' }
  let score = 0
  if (pw.length >= 12) score += 1
  if (pw.length >= 16) score += 1
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1
  if (pw.length < 12) return { score: 1, label: 'Too short' }
  const clamped = Math.min(4, Math.max(1, score)) as 1 | 2 | 3 | 4
  return { score: clamped, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][clamped] ?? '' }
}

export function StrengthMeter({ password }: { readonly password: string }) {
  const { score, label } = passwordStrength(password)
  if (!password) return null
  const colors = ['bg-border-default', 'bg-critical', 'bg-caution', 'bg-info', 'bg-positive']
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= score ? (colors[score] ?? '') : 'bg-border-subtle'}`} />
        ))}
      </div>
      <p className="mt-1.5 text-caption text-content-tertiary">{label}</p>
    </div>
  )
}
