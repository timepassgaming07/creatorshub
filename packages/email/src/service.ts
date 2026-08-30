/**
 * Transactional Email Service (@creatorhub/email).
 *
 * Responsibilities:
 * 1. Format raw minor-unit financial data (zero-float compliant) into display currencies.
 * 2. Assemble receipt & digital fulfillment emails with secure download links.
 * 3. Dispatch through injected EmailProvider port (Memory, SES, Postmark, Resend).
 */
import type { EmailProvider, SendEmailResult } from './port.js'
import {
  type DownloadLinkItem,
  type ReceiptItem,
  renderReceiptEmail,
} from './templates/receipt.js'

export type FormatCurrencyOptions = {
  readonly amountMinor: bigint | number | string
  readonly currency: string
  readonly locale?: string
}

export function formatMinorCurrency(options: FormatCurrencyOptions): string {
  const minor = BigInt(options.amountMinor)
  const isNegative = minor < 0n
  const absolute = isNegative ? -minor : minor
  const major = absolute / 100n
  const cents = (absolute % 100n).toString().padStart(2, '0')
  const formattedNumber = `${major.toString()}.${cents}`

  const curr = options.currency.toUpperCase()
  const symbol = curr === 'INR' ? '₹' : curr === 'USD' ? '$' : curr === 'EUR' ? '€' : `${curr} `

  return `${isNegative ? '-' : ''}${symbol}${formattedNumber}`
}

export type SendOrderReceiptPayload = {
  readonly workspaceName: string
  readonly storefrontUrl?: string | undefined
  readonly customerName?: string | null | undefined
  readonly customerEmail: string
  readonly orderId: string
  readonly orderDate?: Date | undefined
  readonly items: readonly {
    readonly title: string
    readonly quantity: number
    readonly unitAmountMinor: bigint | number | string
    readonly totalAmountMinor: bigint | number | string
  }[]
  readonly subtotalAmountMinor: bigint | number | string
  readonly discountAmountMinor?: bigint | number | string | null | undefined
  readonly couponCode?: string | null | undefined
  readonly taxAmountMinor: bigint | number | string
  readonly totalAmountMinor: bigint | number | string
  readonly currency: string
  readonly downloadLinks: readonly {
    readonly productTitle: string
    readonly downloadUrl: string
    readonly maxDownloads?: number | undefined
    readonly expiresAt: Date
  }[]
  readonly supportEmail?: string | undefined
}

export class TransactionalEmailService {
  constructor(
    private readonly provider: EmailProvider,
    private readonly config: {
      readonly defaultFrom?: string | undefined
      readonly supportEmail?: string | undefined
    } = {},
  ) {}

  async sendOrderReceipt(payload: SendOrderReceiptPayload): Promise<SendEmailResult> {
    const curr = payload.currency

    const formattedItems: ReceiptItem[] = payload.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unitPriceFormatted: formatMinorCurrency({
        amountMinor: item.unitAmountMinor,
        currency: curr,
      }),
      totalFormatted: formatMinorCurrency({
        amountMinor: item.totalAmountMinor,
        currency: curr,
      }),
    }))

    const formattedDownloads: DownloadLinkItem[] = payload.downloadLinks.map((dl) => ({
      productTitle: dl.productTitle,
      downloadUrl: dl.downloadUrl,
      maxDownloads: dl.maxDownloads ?? 5,
      expiresAtFormatted: dl.expiresAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    }))

    const discountFormatted =
      payload.discountAmountMinor && BigInt(payload.discountAmountMinor) > 0n
        ? formatMinorCurrency({
            amountMinor: payload.discountAmountMinor,
            currency: curr,
          })
        : null

    const rendered = renderReceiptEmail({
      workspaceName: payload.workspaceName,
      storefrontUrl: payload.storefrontUrl,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      orderId: payload.orderId,
      orderDateFormatted: (payload.orderDate ?? new Date()).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      items: formattedItems,
      subtotalFormatted: formatMinorCurrency({
        amountMinor: payload.subtotalAmountMinor,
        currency: curr,
      }),
      discountFormatted,
      couponCode: payload.couponCode,
      taxFormatted: formatMinorCurrency({
        amountMinor: payload.taxAmountMinor,
        currency: curr,
      }),
      totalFormatted: formatMinorCurrency({
        amountMinor: payload.totalAmountMinor,
        currency: curr,
      }),
      currency: curr,
      downloadLinks: formattedDownloads,
      supportEmail: payload.supportEmail ?? this.config.supportEmail,
    })

    return this.provider.send({
      to: {
        email: payload.customerEmail,
        ...(payload.customerName ? { name: payload.customerName } : {}),
      },
      from: this.config.defaultFrom ?? `${payload.workspaceName} <no-reply@creatorhub.online>`,
      replyTo: payload.supportEmail ?? this.config.supportEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: {
        type: 'order_receipt',
        orderId: payload.orderId,
      },
    })
  }
}
