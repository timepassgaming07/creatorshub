/**
 * In-memory Transactional Email Adapter.
 *
 * Responsibilities:
 * 1. Capture sent transactional emails in-memory for testing, staging, and sandboxes.
 * 2. Expose inspection helpers (findSentEmailTo, getSentEmails, clear) for assertions.
 */
import { randomUUID } from 'node:crypto'

import type { EmailProvider, SendEmailInput, SendEmailResult } from '../port.js'

export type RecordedEmail = SendEmailInput & {
  readonly messageId: string
  readonly timestamp: Date
}

export class MemoryEmailProvider implements EmailProvider {
  readonly name: string = 'memory'
  private sent: RecordedEmail[] = []

  async send(input: SendEmailInput): Promise<SendEmailResult> {
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
    return this.sent.find((email) => {
      if (typeof email.to === 'string') {
        return email.to.toLowerCase().trim() === target
      }
      if (Array.isArray(email.to)) {
        return email.to.some((item) =>
          typeof item === 'string'
            ? item.toLowerCase().trim() === target
            : item.email.toLowerCase().trim() === target,
        )
      }
      if (typeof email.to === 'object' && email.to !== null && 'email' in email.to) {
        return email.to.email.toLowerCase().trim() === target
      }
      return false
    })
  }

  clear(): void {
    this.sent = []
  }
}
