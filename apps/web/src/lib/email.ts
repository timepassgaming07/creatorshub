/**
 * Transactional Email Client & Service for Web Application.
 *
 * Exposes a singleton TransactionalEmailService backed by the configured EmailProvider.
 */
import { MemoryEmailProvider, TransactionalEmailService } from '@creatorhub/email'

let globalEmailProvider: MemoryEmailProvider | null = null
let globalEmailService: TransactionalEmailService | null = null

export function getEmailProvider(): MemoryEmailProvider {
  if (!globalEmailProvider) {
    globalEmailProvider = new MemoryEmailProvider()
  }
  return globalEmailProvider
}

export function getEmailService(): TransactionalEmailService {
  if (!globalEmailService) {
    const provider = getEmailProvider()
    globalEmailService = new TransactionalEmailService(provider, {
      defaultFrom: process.env['EMAIL_FROM'] ?? 'CreatorHub <no-reply@creatorhub.online>',
      supportEmail: process.env['SUPPORT_EMAIL'] ?? 'support@creatorhub.online',
    })
  }
  return globalEmailService
}
