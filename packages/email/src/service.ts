/**
 * Transactional Email Service (@creatorhub/email).
 *
 * Responsibilities:
 * 1. Format raw minor-unit financial data (zero-float compliant) into display currencies.
 * 2. Assemble receipt & digital fulfillment emails with secure download links.
 * 3. Dispatch through injected EmailProvider port (Memory, SES, Postmark, Resend).
 */
import type { EmailProvider, SendEmailResult } from './port.js'
import { renderActionEmail } from './templates/action.js'
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
      from: this.fromFor(payload.workspaceName),
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

  /**
   * Buyers see the creator's brand, not ours, but the address must stay on a
   * domain we have verified with the provider or the mail is rejected.
   */
  private fromFor(brand?: string): { email: string; name?: string } {
    const configured = this.config.defaultFrom ?? 'CreatorHub <no-reply@creatorhub.online>'
    const match = /<([^>]+)>/.exec(configured)
    const email = (match?.[1] ?? configured).trim()
    const defaultName = match ? configured.slice(0, configured.indexOf('<')).trim() : 'CreatorHub'
    return { email, name: brand ? `${brand} via CreatorHub` : defaultName || 'CreatorHub' }
  }

  async sendPasswordReset(input: {
    readonly to: string
    readonly name?: string | null | undefined
    readonly url: string
  }): Promise<SendEmailResult> {
    const rendered = renderActionEmail({
      subject: 'Reset your CreatorHub password',
      preheader: 'Use this link within the hour to choose a new password.',
      heading: 'Reset your password',
      paragraphs: [
        `${input.name ? `Hi ${input.name}, s` : 'S'}omeone asked to reset the password for this account. If that was you, choose a new password below.`,
        'If it was not you, ignore this email. Your password stays as it is.',
      ],
      action: { label: 'Choose a new password', url: input.url },
      footnote: 'This link expires in one hour and works once. Every other signed-in device is signed out when you change your password.',
    })
    return this.provider.send({
      to: input.to,
      from: this.fromFor(),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: { type: 'password_reset' },
    })
  }

  async sendEmailVerification(input: {
    readonly to: string
    readonly name?: string | null | undefined
    readonly url: string
  }): Promise<SendEmailResult> {
    const rendered = renderActionEmail({
      subject: 'Confirm your email for CreatorHub',
      preheader: 'One click to confirm this address.',
      heading: 'Confirm your email',
      paragraphs: [
        `${input.name ? `Hi ${input.name}, t` : 'T'}hanks for signing up. Confirm this address so receipts, payout notices, and password resets reach you.`,
      ],
      action: { label: 'Confirm email', url: input.url },
      footnote: 'If you did not create a CreatorHub account, ignore this email.',
    })
    return this.provider.send({
      to: input.to,
      from: this.fromFor(),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: { type: 'email_verification' },
    })
  }

  async sendMemberInvite(input: {
    readonly to: string
    readonly workspaceName: string
    readonly inviterName: string
    readonly role: string
    readonly url: string
  }): Promise<SendEmailResult> {
    const rendered = renderActionEmail({
      subject: `${input.inviterName} added you to ${input.workspaceName} on CreatorHub`,
      preheader: `You now have ${input.role} access to ${input.workspaceName}.`,
      heading: `You have been added to ${input.workspaceName}`,
      paragraphs: [
        `${input.inviterName} gave you ${input.role} access to the ${input.workspaceName} workspace on CreatorHub.`,
        'Sign in with this email address to open it. If you do not have an account yet, create one with this address and the workspace will be waiting.',
      ],
      action: { label: `Open ${input.workspaceName}`, url: input.url },
      brand: input.workspaceName,
    })
    return this.provider.send({
      to: input.to,
      from: this.fromFor(input.workspaceName),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: { type: 'member_invite' },
    })
  }

  async sendAffiliateInvite(input: {
    readonly to: string
    readonly storeName: string
    readonly commissionPercent: string
    readonly referralUrl: string
    readonly portalUrl: string
  }): Promise<SendEmailResult> {
    const rendered = renderActionEmail({
      subject: `${input.storeName} invited you to their affiliate programme`,
      preheader: `Earn ${input.commissionPercent} on every sale you refer.`,
      heading: `Earn ${input.commissionPercent} on every sale you send to ${input.storeName}`,
      paragraphs: [
        `Share this link anywhere: ${input.referralUrl}`,
        'When someone buys through it, you earn a commission. Commissions are held for 30 days in case of refunds, then become payable to you.',
        'Open your affiliate dashboard to see clicks, sales, and earnings, and to add where you want to be paid. Sign in or create an account with this email address.',
      ],
      action: { label: 'Open your affiliate dashboard', url: input.portalUrl },
      brand: input.storeName,
    })
    return this.provider.send({
      to: input.to,
      from: this.fromFor(input.storeName),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: { type: 'affiliate_invite' },
    })
  }

  /** A security-relevant change the account owners should know about. */
  async sendSecurityNotice(input: {
    readonly to: readonly string[]
    readonly workspaceName: string
    readonly subject: string
    readonly heading: string
    readonly paragraphs: readonly string[]
    readonly url: string
  }): Promise<SendEmailResult> {
    const rendered = renderActionEmail({
      subject: input.subject,
      preheader: input.paragraphs[0] ?? input.heading,
      heading: input.heading,
      paragraphs: [...input.paragraphs],
      action: { label: 'Review in CreatorHub', url: input.url },
    })
    return this.provider.send({
      to: [...input.to],
      from: this.fromFor(),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: { type: 'security_notice' },
    })
  }

  async sendSaleNotification(input: {
    readonly to: readonly string[]
    readonly workspaceName: string
    readonly productSummary: string
    readonly amountFormatted: string
    readonly customerEmail: string
    readonly orderUrl: string
  }): Promise<SendEmailResult | null> {
    if (input.to.length === 0) return null
    const rendered = renderActionEmail({
      subject: `New sale: ${input.productSummary} (${input.amountFormatted})`,
      preheader: `${input.customerEmail} just bought from ${input.workspaceName}.`,
      heading: `You made a sale: ${input.amountFormatted}`,
      paragraphs: [
        `${input.customerEmail} bought ${input.productSummary} from ${input.workspaceName}.`,
        'Their files were delivered automatically. The order, customer record, and ledger entries are already in your dashboard.',
      ],
      action: { label: 'View order', url: input.orderUrl },
      brand: input.workspaceName,
    })
    return this.provider.send({
      to: [...input.to],
      from: this.fromFor(),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: { type: 'sale_notification' },
    })
  }
}
