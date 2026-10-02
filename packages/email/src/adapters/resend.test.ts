import { describe, expect, it, vi } from 'vitest'

import { TransactionalEmailService } from '../service.js'
import { MemoryEmailProvider } from './memory.js'
import { EmailDeliveryError, ResendEmailProvider } from './resend.js'

function fakeResend(status = 200) {
  const fetcher = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      status === 200
        ? new Response(JSON.stringify({ id: 'msg_123' }), { status })
        : new Response('{"message":"invalid from"}', { status }),
    ),
  )
  return {
    fetcher,
    provider: new ResendEmailProvider({ apiKey: 're_test', fetcher: fetcher as never }),
  }
}

describe('ResendEmailProvider', () => {
  it('posts a well-formed email and returns the message id', async () => {
    const { fetcher, provider } = fakeResend()

    const result = await provider.send({
      to: { email: 'buyer@example.com', name: 'Asha' },
      from: { email: 'no-reply@creatorhub.online', name: 'Studio, "Nova" via CreatorHub' },
      subject: 'Your order',
      html: '<p>hi</p>',
      tags: { type: 'order_receipt', orderId: '018f-abc' },
    })

    expect(result.messageId).toBe('msg_123')
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('https://api.resend.com/emails')
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer re_test')
    const body = JSON.parse(init?.body as string) as Record<string, unknown>
    // A comma in the brand must not create a second recipient.
    expect(body['from']).toBe(`"Studio, 'Nova' via CreatorHub" <no-reply@creatorhub.online>`)
    expect(body['to']).toEqual(['"Asha" <buyer@example.com>'])
    expect(body['tags']).toEqual([
      { name: 'type', value: 'order_receipt' },
      { name: 'orderId', value: '018f-abc' },
    ])
  })

  it('throws when Resend rejects the email', async () => {
    const { provider } = fakeResend(422)
    await expect(
      provider.send({ to: 'a@b.co', from: 'x@y.co', subject: 's', html: 'h' }),
    ).rejects.toThrow(EmailDeliveryError)
  })

  it('refuses to construct without an API key', () => {
    expect(() => new ResendEmailProvider({ apiKey: '' })).toThrow()
  })
})

describe('TransactionalEmailService action emails', () => {
  it('sends a password reset with the link escaped into the button', async () => {
    const provider = new MemoryEmailProvider()
    const service = new TransactionalEmailService(provider, {
      defaultFrom: 'CreatorHub <no-reply@creatorhub.online>',
    })

    await service.sendPasswordReset({
      to: 'creator@example.com',
      url: 'https://app.example/reset-password?token=a&b=<x>',
    })

    const sent = provider.findSentEmailTo('creator@example.com')
    expect(sent?.subject).toBe('Reset your CreatorHub password')
    expect(sent?.html).toContain('token=a&amp;b=&lt;x&gt;')
    expect(sent?.html).not.toContain('<x>')
    expect(sent?.text).toContain('https://app.example/reset-password?token=a&b=<x>')
  })

  it('brands receipts and invites with the creator name on our verified address', async () => {
    const provider = new MemoryEmailProvider()
    const service = new TransactionalEmailService(provider, {
      defaultFrom: 'CreatorHub <no-reply@creatorhub.online>',
    })

    await service.sendMemberInvite({
      to: 'teammate@example.com',
      workspaceName: 'Asha Studio',
      inviterName: 'Asha',
      role: 'admin',
      url: 'https://app.example/workspaces/1',
    })

    expect(provider.findSentEmailTo('teammate@example.com')?.from).toEqual({
      email: 'no-reply@creatorhub.online',
      name: 'Asha Studio via CreatorHub',
    })
  })

  it('skips a sale notification with no recipients', async () => {
    const service = new TransactionalEmailService(new MemoryEmailProvider())
    await expect(
      service.sendSaleNotification({
        to: [],
        workspaceName: 'W',
        productSummary: 'P',
        amountFormatted: '₹1.00',
        customerEmail: 'c@example.com',
        orderUrl: 'https://x',
      }),
    ).resolves.toBeNull()
  })
})
