'use client'

/**
 * Sign In Screen — Centered Liquid Glass Architecture.
 *
 * Provides a focused authentication interface with:
 * - Dynamic theme adaptation (Light Pearl & Dark Obsidian)
 * - Ultra-frosted liquid glass card with border beam highlight
 * - Email/Password & 1-click Passkey (Face ID / Touch ID) sign-in
 * - Top navigation bar with logo and theme toggle
 */
import { useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Button, Input, useToast } from '@creatorhub/ui'
import { signIn } from '@/lib/auth-client'
import { BorderBeam } from '@/components/ui/BorderBeam'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export default function SignInPage() {
  const router = useRouter()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const getRedirect = () => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('redirect') ?? '/workspaces/01a05be5-8154-715e-929e-9b2a78bef69f'
    }
    return '/workspaces/01a05be5-8154-715e-929e-9b2a78bef69f'
  }

  async function handleDemoSignIn() {
    setEmail('creator_demo@studionova.com')
    setPassword('SuperSecretPassword123!')
    setLoading(true)
    setError(undefined)

    try {
      const result = await signIn.email({
        email: 'creator_demo@studionova.com',
        password: 'SuperSecretPassword123!',
      })

      if (result.error) {
        setError(result.error.message ?? 'Demo sign-in failed.')
        setLoading(false)
        return
      }

      toast.show({
        title: 'Signed in as Studio Nova',
        description: 'Welcome back to your creator dashboard.',
        variant: 'success',
      })

      router.push(getRedirect())
    } catch {
      setError('An unexpected error occurred during demo sign in.')
      setLoading(false)
    }
  }

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
        email: email.trim().toLowerCase(),
        password,
      })

      if (result.error) {
        setError(result.error.message ?? 'Invalid email or password. Please try again.')
        setLoading(false)
        return
      }

      toast.show({
        title: 'Signed in successfully',
        description: 'Welcome back to your creator dashboard.',
        variant: 'success',
      })

      router.push(getRedirect())
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
        description: 'Welcome back to your creator dashboard.',
        variant: 'success',
      })

      router.push('/workspaces/new')
    } catch {
      setError('Passkey authentication was cancelled or failed. Please try again.')
      setPasskeyLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-surface-base text-content-primary flex flex-col justify-between overflow-x-hidden font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-300">
      {/* Ambient background glow & cyber grid */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20 dark:opacity-30" />
        <div className="absolute -top-[180px] left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-tr from-indigo-500/25 via-purple-500/25 to-pink-500/20 blur-[130px] animate-pulse-slow" />
        <div className="absolute bottom-[-100px] left-[-100px] h-[350px] w-[350px] rounded-full bg-purple-500/15 blur-[120px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-sm font-black text-white shadow-md shadow-indigo-500/25 transition-transform group-hover:scale-105">
            C
          </div>
          <span className="text-base font-black tracking-tight text-content-primary">CreatorHub</span>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/sign-up"
            className="rounded-xl bg-accent/10 border border-accent/20 px-3.5 py-1.5 text-xs font-bold text-accent hover:bg-accent/20 transition-colors"
          >
            Create Store
          </Link>
        </div>
      </header>

      {/* Centered Liquid Glass Card Container */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative w-full max-w-[440px] liquid-glass rounded-[32px] p-8 sm:p-10"
        >
          <BorderBeam size={220} duration={10} colorFrom="#6366f1" colorTo="#ec4899" />

          {/* Heading */}
          <div className="text-center mb-6 space-y-2">
            <div className="flex items-center justify-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                <span>⚡ Welcome Back</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail('creator_demo@studionova.com')
                  setPassword('SuperSecretPassword123!')
                  setError(undefined)
                }}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                title="Click to fill demo creator credentials"
              >
                <span>Demo Fill</span>
              </button>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-content-primary">
              Sign in to CreatorHub
            </h1>
            <p className="text-xs sm:text-sm text-content-secondary max-w-sm mx-auto">
              Manage your products, view orders, and track your store sales.
            </p>
          </div>

          {/* 1-Click Demo Login Quick Banner */}
          <div className="mb-6 p-4 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-pink-500/10 backdrop-blur-md space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <span>⚡</span> Quick Demo Access
              </span>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/15 border border-indigo-500/30 rounded-full px-2 py-0.5">
                Studio Nova
              </span>
            </div>
            <p className="text-[11px] text-content-secondary leading-snug">
              Instant 1-click access with the pre-seeded verified creator account:
              <br />
              <span className="font-mono text-content-primary font-semibold">creator_demo@studionova.com</span>
            </p>
            <Button
              type="button"
              variant="primary"
              size="medium"
              fullWidth
              loading={loading}
              loadingLabel="Signing in to demo account..."
              onClick={() => void handleDemoSignIn()}
              className="py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-black text-xs shadow-md shadow-indigo-500/25 cursor-pointer"
            >
              ⚡ 1-Click Demo Sign In (Studio Nova)
            </Button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmit(e)
            }}
            className="flex flex-col gap-5"
            noValidate
          >
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs"
              >
                <p className="font-bold text-red-500 dark:text-red-400">Sign in note</p>
                <p className="mt-0.5 text-red-600 dark:text-red-300">{error}</p>
              </motion.div>
            )}

            <div className="flex flex-col gap-4">
              <Input
                label="Email Address"
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
              className="mt-2 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-black shadow-lg shadow-indigo-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Sign In with Email →
            </Button>

            <div className="flex items-center gap-3 my-1">
              <div className="h-px flex-1 bg-border-subtle" />
              <span className="text-[10px] font-bold text-content-tertiary uppercase tracking-wider">or biometric</span>
              <div className="h-px flex-1 bg-border-subtle" />
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
              className="py-3.5 rounded-2xl border border-border-control bg-surface-raised/80 hover:bg-surface-overlay text-content-primary font-bold transition-colors backdrop-blur-xl"
            >
              <span className="flex items-center justify-center gap-2 text-xs">
                <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                Sign in with a Passkey (Face ID / Touch ID)
              </span>
            </Button>

            <p className="text-center text-xs text-content-secondary pt-2">
              Don&apos;t have a store yet?{' '}
              <Link
                href="/sign-up"
                className="font-bold text-accent hover:underline transition-colors"
              >
                Create your store free
              </Link>
            </p>
          </form>
        </motion.div>
      </div>

      {/* Footer copyright */}
      <footer className="relative z-10 py-6 text-center text-xs text-content-tertiary">
        <p>© {new Date().getFullYear()} CreatorHub. All rights reserved.</p>
      </footer>
    </main>
  )
}
