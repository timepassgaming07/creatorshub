'use client'

/**
 * Sign Up Screen — Centered Liquid Glass Architecture.
 *
 * Provides a focused, single-column authentication experience with:
 * - Dynamic theme adaptation (Light Pearl & Dark Obsidian)
 * - Ultra-frosted liquid glass card with border beam highlight
 * - Live interactive password strength meter
 * - Top navigation bar with logo and theme toggle
 */
import { useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Button, Input, useToast } from '@creatorhub/ui'
import { signUp } from '@/lib/auth-client'
import { BorderBeam } from '@/components/ui/BorderBeam'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export default function SignUpPage() {
  const router = useRouter()
  const toast = useToast()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  // Live password strength calculation
  const getStrength = (pw: string): { level: number; label: string; color: string } => {
    if (pw.length === 0) return { level: 0, label: '', color: '' }
    if (pw.length < 8) return { level: 1, label: 'Weak', color: 'bg-red-500' }
    if (pw.length < 12) return { level: 2, label: 'Fair', color: 'bg-amber-500' }
    const hasUpper = /[A-Z]/.test(pw)
    const hasNumber = /[0-9]/.test(pw)
    const hasSpecial = /[^A-Za-z0-9]/.test(pw)
    const bonus = [hasUpper, hasNumber, hasSpecial].filter(Boolean).length
    if (pw.length >= 12 && bonus >= 2) return { level: 4, label: 'Strong', color: 'bg-emerald-500' }
    return { level: 3, label: 'Good', color: 'bg-indigo-500' }
  }

  const strength = getStrength(password)

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
        description: 'Now let us set up your digital store.',
        variant: 'success',
      })

      router.push('/workspaces/new')
    } catch {
      setError('An unexpected error occurred while creating your account. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-surface-base text-content-primary flex flex-col justify-between overflow-x-hidden font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-300">
      {/* Ambient background glow & cyber grid */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20 dark:opacity-30" />
        <div className="absolute -top-[180px] left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-tr from-indigo-500/25 via-purple-500/25 to-pink-500/20 blur-[130px] animate-pulse-slow" />
        <div className="absolute bottom-[-100px] right-[-100px] h-[350px] w-[350px] rounded-full bg-emerald-500/15 blur-[120px]" />
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
            href="/sign-in"
            className="rounded-xl px-3.5 py-1.5 text-xs font-bold text-content-secondary hover:text-content-primary transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Centered Liquid Glass Card Container */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative w-full max-w-[460px] liquid-glass rounded-[32px] p-8 sm:p-10"
        >
          <BorderBeam size={220} duration={10} colorFrom="#6366f1" colorTo="#ec4899" />

          {/* Heading */}
          <div className="text-center mb-8 space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <span>⚡ Free Instant Setup</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-content-primary">
              Create your store
            </h1>
            <p className="text-xs sm:text-sm text-content-secondary max-w-sm mx-auto">
              Start selling your digital downloads, courses, and services with ₹0 monthly subscription fees.
            </p>
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
                <p className="font-bold text-red-500 dark:text-red-400">Registration note</p>
                <p className="mt-0.5 text-red-600 dark:text-red-300">{error}</p>
              </motion.div>
            )}

            <div className="flex flex-col gap-4">
              <Input
                label="Your Name or Brand"
                type="text"
                name="name"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                }}
                disabled={loading}
                placeholder="e.g. Alex Rivera"
              />

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
                disabled={loading}
                placeholder="alex@yourbrand.com"
              />

              <div>
                <Input
                  label="Create Password"
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

                {/* Password strength indicator */}
                {password.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex flex-1 gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                              i <= strength.level ? strength.color : 'bg-slate-200 dark:bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                      <span className={`text-[10px] font-extrabold ${
                        strength.level <= 1 ? 'text-red-500' :
                        strength.level === 2 ? 'text-amber-500' :
                        strength.level === 3 ? 'text-indigo-500' :
                        'text-emerald-500'
                      }`}>
                        {strength.label}
                      </span>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="large"
              fullWidth
              loading={loading}
              loadingLabel="Creating store..."
              className="mt-2 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-black shadow-lg shadow-indigo-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Launch My Store Free →
            </Button>

            <div className="pt-2 text-center space-y-3">
              <p className="text-xs text-content-secondary">
                Already have an account?{' '}
                <Link
                  href="/sign-in"
                  className="font-bold text-accent hover:underline transition-colors"
                >
                  Sign in
                </Link>
              </p>

              <div className="flex items-center justify-center gap-4 text-[11px] text-content-tertiary pt-2 border-t border-border-subtle">
                <span>✓ ₹0 Monthly Fee</span>
                <span>✓ Instant UPI & Cards</span>
                <span>✓ Cancel Anytime</span>
              </div>
            </div>
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
