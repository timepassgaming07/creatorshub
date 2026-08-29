'use client'

/**
 * Sign In Screen.
 *
 * Responsibilities: authenticate existing users with email and password via Better Auth.
 * Design: intentional whitespace, premium tokens, clear error resolution, 4 states.
 */
import { useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Input, useToast } from '@creatorhub/ui'

import { signIn } from '@/lib/auth-client'

export default function SignInPage() {
  const router = useRouter()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault()
    setError(undefined)

    if (!email || !password) {
      setError('Please enter both your email address and password.')
      return
    }

    setLoading(true)

    try {
      const result = await signIn.email({
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message ?? 'Invalid email or password. Please try again.')
        setLoading(false)
        return
      }

      toast.show({
        title: 'Signed in successfully',
        description: 'Welcome back to CreatorHub.',
        variant: 'success',
      })

      router.push('/workspaces/new')
    } catch {
      setError('An unexpected error occurred while signing in. Please try again.')
      setLoading(false)
    }
  }

  async function handlePasskeySignIn() {
    setError(undefined)
    setPasskeyLoading(true)

    try {
      const result = await signIn.passkey()

      if (result.error) {
        setError(
          result.error.message ??
            'Passkey sign-in failed. Please try again or use your email and password.',
        )
        setPasskeyLoading(false)
        return
      }

      toast.show({
        title: 'Signed in with passkey',
        description: 'Welcome back to CreatorHub.',
        variant: 'success',
      })

      router.push('/workspaces/new')
    } catch {
      setError('Passkey authentication was cancelled or failed. Please try again.')
      setPasskeyLoading(false)
    }
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface-raised border-border-control w-full max-w-md rounded-lg border p-8 shadow-elevation-1">
        <div className="mb-8 flex flex-col gap-2 text-center">
          <h1 className="font-display text-title text-content-primary">Sign in to CreatorHub</h1>
          <p className="text-body text-content-secondary">
            The operating system for your digital business.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit(e)
          }}
          className="flex flex-col gap-6"
          noValidate
        >
          {error && (
            <div
              role="alert"
              className="bg-critical-subtle text-critical border-critical rounded-sm border p-4 text-caption"
            >
              <p className="font-medium">Authentication error</p>
              <p>{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <Input
              label="Email address"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
              }}
              disabled={loading || passkeyLoading}
              placeholder="you@example.com"
            />

            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
              }}
              disabled={loading || passkeyLoading}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="large"
            fullWidth
            loading={loading}
            loadingLabel="Signing in..."
            disabled={passkeyLoading}
          >
            Sign in
          </Button>

          <div className="flex items-center gap-4">
            <div className="bg-border-subtle h-px flex-1" />
            <span className="text-caption text-content-tertiary">or</span>
            <div className="bg-border-subtle h-px flex-1" />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="large"
            fullWidth
            loading={passkeyLoading}
            loadingLabel="Verifying passkey..."
            disabled={loading}
            onClick={() => {
              void handlePasskeySignIn()
            }}
          >
            Sign in with a passkey
          </Button>

          <p className="text-caption text-content-secondary text-center">
            Do not have an account?{' '}
            <Link
              href="/sign-up"
              className="text-content-primary hover:underline font-medium focus:outline-none"
            >
              Create account
            </Link>
          </p>
        </form>
      </div>
    </main>
  )
}
