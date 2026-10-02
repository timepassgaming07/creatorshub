'use client'

import { useState, type SubmitEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@creatorhub/ui'

import { AuthShell, safeRedirect } from '@/components/auth/AuthShell'
import { authErrorMessage, FormError } from '@/components/auth/FormError'
import { PasswordField, StrengthMeter } from '@/components/auth/PasswordField'
import { authClient } from '@/lib/auth-client'

export function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const next = safeRedirect(params.get('next'))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    params.get('error')
      ? 'This reset link has expired or was already used. Request a new one.'
      : null,
  )

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!token) {
      setError('This reset link is incomplete. Open the link from your email again.')
      return
    }
    if (password.length < 12) {
      setError('Use at least 12 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setLoading(true)
    const result = await authClient.resetPassword({ newPassword: password, token })
    if (result.error) {
      setLoading(false)
      setError(
        authErrorMessage(
          result.error.code,
          result.error.message ?? 'Could not reset the password.',
        ),
      )
      return
    }
    router.push(`/sign-in?reset=1&redirect=${encodeURIComponent(next)}`)
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Every other device will be signed out."
      footer={
        <Link
          href="/forgot-password"
          className="font-medium text-content-primary underline-offset-4 hover:underline"
        >
          Request a new link
        </Link>
      }
    >
      <FormError message={error} />
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <div>
          <PasswordField
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <StrengthMeter password={password} />
        </div>
        <PasswordField
          label="Confirm new password"
          name="confirm"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        <Button type="submit" fullWidth size="large" loading={loading} loadingLabel="Saving">
          Save password
        </Button>
      </form>
    </AuthShell>
  )
}
