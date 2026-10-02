/**
 * Resend EmailProvider adapter.
 *
 * Responsibilities: deliver transactional email through the Resend HTTP API.
 * Dependencies: global fetch. No SDK, because the API is one POST and an SDK
 * would be a dependency that runs nothing we need.
 *
 * A send that Resend rejects throws. Callers decide whether a failed email
 * fails their operation; for a receipt it must not, because the payment has
 * already been taken and the creator can resend from the order page.
 */
import type { EmailAddress, EmailProvider, SendEmailInput, SendEmailResult } from '../port.js'

export type ResendProviderOptions = {
  readonly apiKey: string
  readonly apiBaseUrl?: string | undefined
  readonly fetcher?: typeof fetch | undefined
}

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}

function formatAddress(address: string | EmailAddress): string {
  if (typeof address === 'string') return address
  if (!address.name) return address.email
  // Quote the display name so a comma or angle bracket in a creator's brand
  // name cannot split it into a second recipient.
  return `"${address.name.replaceAll('"', "'")}" <${address.email}>`
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend'

  private readonly apiKey: string
  private readonly apiBaseUrl: string
  private readonly fetcher: typeof fetch

  constructor(options: ResendProviderOptions) {
    if (!options.apiKey) {
      throw new Error('ResendEmailProvider needs RESEND_API_KEY.')
    }
    this.apiKey = options.apiKey
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.resend.com'
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!input.from) {
      throw new Error('ResendEmailProvider requires a from address.')
    }

    const recipients = Array.isArray(input.to) ? input.to : [input.to]
    const body: Record<string, unknown> = {
      from: formatAddress(input.from),
      to: (recipients as readonly (string | EmailAddress)[]).map(formatAddress),
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { reply_to: formatAddress(input.replyTo) } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
      ...(input.tags
        ? {
            tags: Object.entries(input.tags).map(([name, value]) => ({
              // Resend allows only ASCII letters, numbers, underscores, dashes.
              name: name.replace(/[^A-Za-z0-9_-]/g, '_'),
              value: value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256),
            })),
          }
        : {}),
    }

    const idempotencyKey = input.headers?.['Idempotency-Key']
    const response = await this.fetcher(`${this.apiBaseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new EmailDeliveryError(
        `Resend rejected the email (${String(response.status)}): ${detail.slice(0, 300)}`,
        response.status,
      )
    }

    const json = (await response.json()) as { id?: string }
    return {
      messageId: json.id ?? '',
      accepted: true,
      provider: this.name,
      timestamp: new Date(),
    }
  }
}
