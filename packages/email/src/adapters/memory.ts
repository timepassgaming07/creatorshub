/**
 * In-memory Transactional Email Adapter.
 *
 * Responsibilities:
 * 1. Capture sent transactional emails in-memory for testing, staging, and sandboxes.
 * 2. Expose inspection helpers (findSentEmailTo, getSentEmails, clear) for assertions.
 */
import { randomUUID } from 'node:crypto'

import type { EmailAddress, EmailProvider, SendEmailInput, SendEmailResult } from '../port.js'

export type RecordedEmail = SendEmailInput & {
  readonly messageId: string
  readonly timestamp: Date
}

// Array.isArray narrows a readonly array to any[]; this guard keeps the type.
function isRecipientList(
  to: SendEmailInput['to'],
): to is readonly (string | EmailAddress)[] {
  return Array.isArray(to)
}

export class MemoryEmailProvider implements EmailProvider {
  readonly name: string = 'memory'
  private sent: RecordedEmail[] = []

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    await Promise.resolve()
    const messageId = `msg_${randomUUID()}`
    const timestamp = new Date()

    const record: RecordedEmail = {
      ...input,
      messageId,
      timestamp,
    }

    this.sent.push(record)

    return {
      messageId,
      accepted: true,
      provider: this.name,
      timestamp,
    }
  }

  async sendBatch(inputs: readonly SendEmailInput[]): Promise<readonly SendEmailResult[]> {
    const results: SendEmailResult[] = []
    for (const input of inputs) {
      results.push(await this.send(input))
    }
    return results
  }

  getSentEmails(): readonly RecordedEmail[] {
    return [...this.sent]
  }

  findSentEmailTo(recipientEmail: string): RecordedEmail | undefined {
    const target = recipientEmail.toLowerCase().trim()
    const addressOf = (item: string | EmailAddress): string =>
      (typeof item === 'string' ? item : item.email).toLowerCase().trim()
    return this.sent.find((email) => {
      const recipients = isRecipientList(email.to) ? email.to : [email.to]
      return recipients.some((item) => addressOf(item) === target)
    })
  }

  clear(): void {
    this.sent = []
  }
}
