/**
 * Development EmailProvider that prints each email to the server log.
 *
 * Local development has no mail server, and a download link or password reset
 * link that only exists in memory cannot be clicked. This records like the
 * memory adapter and also writes the recipient, subject, and every link to
 * stdout. The web app refuses it in production.
 */
import type { SendEmailInput, SendEmailResult } from '../port.js'
import { MemoryEmailProvider } from './memory.js'

export class LogEmailProvider extends MemoryEmailProvider {
  override readonly name = 'log'

  constructor(private readonly write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)) {
    super()
  }

  override async send(input: SendEmailInput): Promise<SendEmailResult> {
    const result = await super.send(input)
    const recipients = (Array.isArray(input.to) ? input.to : [input.to]) as readonly (
      | string
      | { email: string }
    )[]
    const to = recipients.map((r) => (typeof r === 'string' ? r : r.email)).join(', ')
    const links = [...input.html.matchAll(/href="([^"]+)"/g)]
      .map((m) => (m[1] ?? '').replaceAll('&amp;', '&'))
      .filter((href) => href.startsWith('http'))
    this.write(`[email] to=${to} subject=${JSON.stringify(input.subject)}`)
    for (const link of new Set(links)) {
      this.write(`[email]   ${link}`)
    }
    return result
  }
}
