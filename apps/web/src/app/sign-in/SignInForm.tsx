'use client'

import { useState, type SubmitEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Fingerprint } from 'lucide-react'
import { Button, Input } from '@creatorhub/ui'

import { AuthShell, safeRedirect } from '@/components/auth/AuthShell'
import { authErrorMessage, FormError } from '@/components/auth/FormError'
import { PasswordField } from '@/components/auth/PasswordField'
import { signIn } from '@/lib/auth-client'

export function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeRedirect(params.get('redirect'))

  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [error, setError] = useState<string | null>(params.get('reset') === '1' ? null : null)

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setLoading(true)
    const result = await signIn.email({ email: email.trim().toLowerCase(), password })
    if (result.error) {
      setLoading(false)
      setError(
        authErrorMessage(result.error.code, result.error.message ?? 'Sign-in failed. Try again.'),
      )
      return
    }
    router.push(next)
    router.refresh()
  }

  async function onPasskey() {
    setError(null)
    setPasskeyLoading(true)
    try {
      const result = await signIn.passkey()
      if (result.error) {
        setError('Your passkey was not accepted. Try again, or use your password.')
        setPasskeyLoading(false)
        return
      }
      router.push(next)
      router.refresh()
    } catch {
      setError('Passkey sign-in was cancelled.')
      setPasskeyLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your creator dashboard."
      footer={
        <>
          New to CreatorHub?{' '}
          <Link
            href={
              next === '/dashboard' ? '/sign-up' : `/sign-up?redirect=${encodeURIComponent(next)}`
            }
            className="font-medium text-content-primary underline-offset-4 hover:underline"
          >
            Create your store
          </Link>
        </>
      }
    >
      {params.get('reset') === '1' && (
        <p
          role="status"
          className="mb-5 rounded-lg bg-positive-subtle px-3.5 py-3 text-body text-content-primary"
        >
          Password updated. Sign in with your new password.
        </p>
      )}
      <FormError message={error} />
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email webauthn"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
          }}
        />
        <div>
          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
          <div className="mt-2 text-right">
            <Link
              href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
              className="text-caption text-content-secondary hover:text-content-primary"
            >
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" fullWidth size="large" loading={loading} loadingLabel="Signing in">
          Sign in
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-caption text-content-tertiary">
        <span className="h-px flex-1 bg-border-subtle" />
        or
        <span className="h-px flex-1 bg-border-subtle" />
      </div>

      <Button
        variant="secondary"
        fullWidth
        size="large"
        loading={passkeyLoading}
        onClick={() => void onPasskey()}
      >
        <Fingerprint className="size-4" aria-hidden="true" />
        Sign in with a passkey
      </Button>
    </AuthShell>
  )
}
