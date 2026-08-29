'use client'

/**
 * Sign Up Screen.
 *
 * Responsibilities: register a new account via Better Auth with 12+ char password.
 * Design: intentional whitespace, premium tokens, clear error resolution, 4 states.
 */
import { useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Input, useToast } from '@creatorhub/ui'

import { signUp } from '@/lib/auth-client'

export default function SignUpPage() {
  const router = useRouter()
  const toast = useToast()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault()
    setError(undefined)

    if (!name.trim()) {
      setError('Please enter your full name.')
      return
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters long.')
      return
    }

    setLoading(true)

    try {
      const result = await signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })

      if (result.error) {
        setError(result.error.message ?? 'Could not create account. Please try again.')
        setLoading(false)
        return
      }

      toast.show({
        title: 'Account created successfully',
        description: 'Now let us set up your first workspace.',
        variant: 'success',
      })

      router.push('/workspaces/new')
    } catch {
      setError('An unexpected error occurred while creating your account. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface-raised border-border-control w-full max-w-md rounded-lg border p-8 shadow-elevation-1">
        <div className="mb-8 flex flex-col gap-2 text-center">
          <h1 className="font-display text-title text-content-primary">Create your account</h1>
          <p className="text-body text-content-secondary">
            Join CreatorHub to launch your digital business.
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
              <p className="font-medium">Registration error</p>
              <p>{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <Input
              label="Full name"
              type="text"
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value)
              }}
              disabled={loading}
              placeholder="Ada Lovelace"
            />

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
              disabled={loading}
              placeholder="you@example.com"
            />

            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              hint="Must be at least 12 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
              }}
              disabled={loading}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="large"
            fullWidth
            loading={loading}
            loadingLabel="Creating account..."
          >
            Create account
          </Button>

          <p className="text-caption text-content-secondary text-center">
            Already have an account?{' '}
            <Link
              href="/sign-in"
              className="text-content-primary hover:underline font-medium focus:outline-none"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  )
}
