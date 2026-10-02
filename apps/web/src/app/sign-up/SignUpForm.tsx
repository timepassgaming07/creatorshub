'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, Input } from '@creatorhub/ui'

import { AuthShell, safeRedirect } from '@/components/auth/AuthShell'
import { authErrorMessage, FormError } from '@/components/auth/FormError'
import { PasswordField, StrengthMeter } from '@/components/auth/PasswordField'
import { authClient, signUp } from '@/lib/auth-client'

export function SignUpForm() {
  const router = useRouter()
  const params = useSearchParams()
  // An invited affiliate signs up to see their earnings, not to open a store.
  const next = safeRedirect(params.get('redirect'), '/workspaces/new')
  const forStore = next === '/workspaces/new'
  const [name, setName] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const errors: Record<string, string> = {}
    if (!name.trim()) errors['name'] = 'Enter your name or brand.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errors['email'] = 'Enter a valid email address.'
    if (password.length < 12) errors['password'] = 'Use at least 12 characters.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setLoading(true)
    const result = await signUp.email({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    })
    if (result.error) {
      setLoading(false)
      setError(
        authErrorMessage(
          result.error.code,
          result.error.message ?? 'Could not create your account.',
        ),
      )
      return
    }
    // Verification is not a gate to start building, but it is to get paid.
    void authClient.sendVerificationEmail({
      email: email.trim().toLowerCase(),
      callbackURL: forStore ? '/dashboard' : next,
    })
    router.push(next)
  }

  return (
    <AuthShell
      title={forStore ? 'Create your store' : 'Create your account'}
      subtitle={
        forStore
          ? 'Free to start. You pay a small fee only when you sell.'
          : 'Use the email address your invitation was sent to.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={forStore ? '/sign-in' : `/sign-in?redirect=${encodeURIComponent(next)}`}
            className="font-medium text-content-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <FormError message={error} />
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <Input
          label="Your name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
          {...(fieldErrors['name'] ? { error: fieldErrors['name'] } : {})}
        />
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
          {...(fieldErrors['email'] ? { error: fieldErrors['email'] } : {})}
        />
        <div>
          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            error={fieldErrors['password']}
            hint="At least 12 characters. A short sentence works well."
          />
          <StrengthMeter password={password} />
        </div>
        <Button
          type="submit"
          fullWidth
          size="large"
          loading={loading}
          loadingLabel="Creating your account"
        >
          Create account
        </Button>
        <p className="text-center text-caption text-content-tertiary">
          By creating an account you agree to our{' '}
          <Link href="/legal/terms" className="underline underline-offset-2">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  )
}
