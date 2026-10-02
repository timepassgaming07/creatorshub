'use client'

import { useState, type SubmitEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { MailCheck } from 'lucide-react'
import { Button, Input } from '@creatorhub/ui'

import { AuthShell, safeRedirect } from '@/components/auth/AuthShell'
import { authErrorMessage, FormError } from '@/components/auth/FormError'
import { authClient } from '@/lib/auth-client'

export function ForgotPasswordForm() {
  const params = useSearchParams()
  const next = safeRedirect(params.get('next'))
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter the email address you signed up with.')
      return
    }
    setLoading(true)
    const result = await authClient.requestPasswordReset({
      email: email.trim().toLowerCase(),
      redirectTo: `/reset-password?next=${encodeURIComponent(next)}`,
    })
    setLoading(false)
    if (result.error?.code === 'TOO_MANY_REQUESTS') {
      setError(authErrorMessage(result.error.code, ''))
      return
    }
    // The same answer whether or not the account exists, so this page cannot
    // be used to find out who has an account.
    setSent(true)
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={
          <>
            If an account exists for <span className="font-medium text-content-primary">{email}</span>, a link to set a
            new password is on its way. It works for one hour.
          </>
        }
        footer={
          <Link href="/sign-in" className="font-medium text-content-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised p-4 text-body text-content-secondary">
          <MailCheck className="size-5 shrink-0 text-positive" aria-hidden="true" />
          Nothing yet? Check spam, or wait a minute and try again.
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Enter your email and we will send you a link."
      footer={
        <Link href="/sign-in" className="font-medium text-content-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <FormError message={error} />
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
          }}
        />
        <Button type="submit" fullWidth size="large" loading={loading} loadingLabel="Sending link">
          Send reset link
        </Button>
      </form>
    </AuthShell>
  )
}
