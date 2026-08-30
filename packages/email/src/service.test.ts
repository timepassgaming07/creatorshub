/**
 * Unit tests for TransactionalEmailService and receipt rendering (@creatorhub/email).
 */
import { describe, expect, it } from 'vitest'

import { MemoryEmailProvider } from './adapters/memory.js'
import { formatMinorCurrency, TransactionalEmailService } from './service.js'
import { renderReceiptEmail } from './templates/receipt.js'

describe('formatMinorCurrency', () => {
  it('formats INR minor units correctly without float inaccuracies', () => {
    expect(formatMinorCurrency({ amountMinor: 199900n, currency: 'INR' })).toBe('₹1999.00')
    expect(formatMinorCurrency({ amountMinor: 50n, currency: 'INR' })).toBe('₹0.50')
    expect(formatMinorCurrency({ amountMinor: 0n, currency: 'INR' })).toBe('₹0.00')
  })

  it('formats USD and EUR minor units with correct symbols', () => {
    expect(formatMinorCurrency({ amountMinor: 4900n, currency: 'USD' })).toBe('$49.00')
    expect(formatMinorCurrency({ amountMinor: 9900n, currency: 'EUR' })).toBe('€99.00')
  })

  it('handles negative minor units properly', () => {
    expect(formatMinorCurrency({ amountMinor: -1500n, currency: 'INR' })).toBe('-₹15.00')
  })
})

describe('renderReceiptEmail', () => {
  it('renders complete HTML and plain text with order breakdown and download links', () => {
    const rendered = renderReceiptEmail({
      workspaceName: 'Dev Academy',
      customerName: 'Sarah Connor',
      customerEmail: 'sarah@example.com',
      orderId: '018f9e2b-7c5e-7a2e-8c3b-000000000001',
      orderDateFormatted: 'Aug 30, 2026',
      items: [
        {
          title: 'Mastering TypeScript & Next.js',
          quantity: 1,
          unitPriceFormatted: '₹1,999.00',
          totalFormatted: '₹1,999.00',
        },
      ],
      subtotalFormatted: '₹1,999.00',
      discountFormatted: '₹200.00',
      couponCode: 'LAUNCH10',
      taxFormatted: '₹323.82',
      totalFormatted: '₹2,122.82',
      currency: 'INR',
      downloadLinks: [
        {
          productTitle: 'Mastering TypeScript & Next.js',
          downloadUrl: 'https://devacademy.creatorhub.online/fulfillment/tok_abc123',
          maxDownloads: 5,
          expiresAtFormatted: 'Sep 6, 2026, 11:59 PM',
        },
      ],
      supportEmail: 'help@devacademy.com',
    })

    expect(rendered.subject).toContain('Dev Academy')
    expect(rendered.subject).toContain('018f9e2b')
    expect(rendered.html).toContain('Sarah Connor')
    expect(rendered.html).toContain('Mastering TypeScript &amp; Next.js')
    expect(rendered.html).toContain('LAUNCH10')
    expect(rendered.html).toContain('https://devacademy.creatorhub.online/fulfillment/tok_abc123')
    expect(rendered.html).toContain('₹2,122.82')

    expect(rendered.text).toContain('ORDER SUMMARY')
    expect(rendered.text).toContain('https://devacademy.creatorhub.online/fulfillment/tok_abc123')
    expect(rendered.text).toContain('help@devacademy.com')
  })
})

describe('TransactionalEmailService', () => {
  it('sends order receipt and records in MemoryEmailProvider', async () => {
    const memory = new MemoryEmailProvider()
    const service = new TransactionalEmailService(memory, {
      defaultFrom: 'CreatorHub <no-reply@creatorhub.online>',
      supportEmail: 'support@creatorhub.online',
    })

    const result = await service.sendOrderReceipt({
      workspaceName: 'Design Vault',
      customerName: 'Alex Smith',
      customerEmail: 'alex@example.com',
      orderId: '018f9e2b-7c5e-7a2e-8c3b-000000000002',
      items: [
        {
          title: '3D Icon Pack',
          quantity: 1,
          unitAmountMinor: 149900n,
          totalAmountMinor: 149900n,
        },
      ],
      subtotalAmountMinor: 149900n,
      discountAmountMinor: 0n,
      taxAmountMinor: 26982n,
      totalAmountMinor: 176882n,
      currency: 'INR',
      downloadLinks: [
        {
          productTitle: '3D Icon Pack (ZIP)',
          downloadUrl: 'https://designvault.creatorhub.online/fulfillment/tok_icons',
          maxDownloads: 5,
          expiresAt: new Date(Date.now() + 86400000 * 7),
        },
      ],
    })

    expect(result.accepted).toBe(true)
    expect(result.provider).toBe('memory')
    expect(result.messageId).toMatch(/^msg_/)

    const sent = memory.findSentEmailTo('alex@example.com')
    expect(sent).toBeDefined()
    expect(sent?.subject).toContain('Design Vault')
    expect(sent?.html).toContain('3D Icon Pack')
    expect(sent?.html).toContain('tok_icons')
  })
})
