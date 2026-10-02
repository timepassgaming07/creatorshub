import { CircleAlert } from 'lucide-react'

export function FormError({ message }: { readonly message: string | null | undefined }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2.5 rounded-lg border border-critical/25 bg-critical-subtle px-3.5 py-3 text-body text-content-primary"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}

/** Better Auth error codes, in words a person can act on. */
export function authErrorMessage(code: string | undefined, fallback: string): string {
  switch (code ?? '') {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'That email and password do not match. Check both, or reset your password.'
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'An account with this email already exists. Sign in instead, or reset your password.'
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 12 characters.'
    case 'PASSWORD_TOO_LONG':
      return 'Use 128 characters or fewer.'
    case 'INVALID_TOKEN':
      return 'This reset link has expired or was already used. Request a new one.'
    case 'TOO_MANY_REQUESTS':
      return 'Too many attempts. Wait a minute and try again.'
    default:
      return fallback
  }
}
