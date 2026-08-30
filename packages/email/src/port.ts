/**
 * Transactional Email Port & Types (@creatorhub/email).
 *
 * Responsibilities:
 * 1. Define clean provider abstraction (Port) for sending transactional emails.
 * 2. Standardize recipient, sender, subject, HTML, plain-text, and metadata payloads.
 * 3. Enforce contract boundaries between domain workflows and mail delivery infrastructure (SES, Postmark, Resend, Memory).
 */

export type EmailAddress = {
  readonly email: string
  readonly name?: string | undefined
}

export type SendEmailInput = {
  readonly to: string | EmailAddress | readonly (string | EmailAddress)[]
  readonly from?: string | EmailAddress | undefined
  readonly replyTo?: string | EmailAddress | undefined
  readonly subject: string
  readonly html: string
  readonly text?: string | undefined
  readonly tags?: Record<string, string> | undefined
  readonly headers?: Record<string, string> | undefined
}

export type SendEmailResult = {
  readonly messageId: string
  readonly accepted: boolean
  readonly provider: string
  readonly timestamp: Date
}

export interface EmailProvider {
  readonly name: string
  send(input: SendEmailInput): Promise<SendEmailResult>
  sendBatch?(inputs: readonly SendEmailInput[]): Promise<readonly SendEmailResult[]>
}
