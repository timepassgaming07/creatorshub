/**
 * Transactional email for the web app.
 *
 * RESEND_API_KEY selects Resend. Without it, development and test mode print
 * each email and its links to the server log; production refuses to start a
 * send rather than silently dropping a buyer's download links.
 */
import {
  LogEmailProvider,
  ResendEmailProvider,
  TransactionalEmailService,
  type EmailProvider,
} from '@creatorhub/email'

import { allowsTestAdapters, ConfigurationError, envValue } from './env'

const globalForEmail = globalThis as unknown as {
  emailProvider?: EmailProvider
  emailService?: TransactionalEmailService
}

export function getEmailProvider(): EmailProvider {
  if (globalForEmail.emailProvider) return globalForEmail.emailProvider

  const apiKey = envValue('RESEND_API_KEY')
  let provider: EmailProvider
  if (apiKey) {
    provider = new ResendEmailProvider({ apiKey })
  } else if (allowsTestAdapters()) {
    provider = new LogEmailProvider()
  } else {
    throw new ConfigurationError('Set RESEND_API_KEY so receipts and password resets can be delivered.')
  }

  globalForEmail.emailProvider = provider
  return provider
}

export function getEmailService(): TransactionalEmailService {
  globalForEmail.emailService ??= new TransactionalEmailService(getEmailProvider(), {
    defaultFrom: envValue('EMAIL_FROM') ?? 'CreatorHub <no-reply@creatorhub.online>',
    supportEmail: envValue('SUPPORT_EMAIL'),
  })
  return globalForEmail.emailService
}
