/**
 * Receipt & Digital Fulfillment Email Template (Slice 6 §6.5).
 *
 * Renders modern light-theme HTML and fallback plain-text email with:
 * 1. Creator/Storefront branding
 * 2. Itemized order breakdown with GST tax calculations
 * 3. Primary CTA button linking directly to the buyer's fulfillment download portal
 * 4. Clear use-cap and expiration policy guidance
 */

export type ReceiptItem = {
  readonly title: string
  readonly quantity: number
  readonly unitPriceFormatted: string
  readonly totalFormatted: string
}

export type DownloadLinkItem = {
  readonly productTitle: string
  readonly downloadUrl: string
  readonly maxDownloads: number
  readonly expiresAtFormatted: string
}

export type RenderReceiptEmailInput = {
  readonly workspaceName: string
  readonly storefrontUrl?: string | undefined
  readonly customerName?: string | null | undefined
  readonly customerEmail: string
  readonly orderId: string
  readonly orderDateFormatted: string
  readonly items: readonly ReceiptItem[]
  readonly subtotalFormatted: string
  readonly discountFormatted?: string | null | undefined
  readonly couponCode?: string | null | undefined
  readonly taxFormatted: string
  readonly totalFormatted: string
  readonly currency: string
  readonly downloadLinks: readonly DownloadLinkItem[]
  readonly supportEmail?: string | undefined
}

export type RenderedEmail = {
  readonly subject: string
  readonly html: string
  readonly text: string
}

export function renderReceiptEmail(input: RenderReceiptEmailInput): RenderedEmail {
  const subject = `Your order from ${input.workspaceName} is ready! (Order #${input.orderId.slice(0, 8)})`
  const greeting = input.customerName ? `Hi ${input.customerName},` : 'Hello,'

  const downloadCardsHtml = input.downloadLinks
    .map(
      (link) => `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; text-align: left;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #0f172a;">${escapeHtml(link.productTitle)}</h3>
        <p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b; line-height: 1.4;">
          Includes ${link.maxDownloads} downloads. Link valid until <strong>${escapeHtml(link.expiresAtFormatted)}</strong>.
        </p>
        <a href="${escapeHtml(link.downloadUrl)}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);">
          Download File &rarr;
        </a>
      </div>
    `,
    )
    .join('')

  const itemsRowsHtml = input.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">
          ${escapeHtml(item.title)} <span style="color: #64748b; font-size: 12px;">&times; ${item.quantity}</span>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600; text-align: right;">
          ${escapeHtml(item.totalFormatted)}
        </td>
      </tr>
    `,
    )
    .join('')

  const discountRowHtml = input.discountFormatted
    ? `
      <tr>
        <td style="padding: 6px 0; color: #16a34a; font-size: 13px;">
          Discount ${input.couponCode ? `(${escapeHtml(input.couponCode)})` : ''}
        </td>
        <td style="padding: 6px 0; color: #16a34a; font-size: 13px; font-weight: 600; text-align: right;">
          -${escapeHtml(input.discountFormatted)}
        </td>
      </tr>
    `
    : ''

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%); border-bottom: 1px solid #e2e8f0; text-align: left;">
              <div style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                ${escapeHtml(input.workspaceName)}
              </div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
                Verified Creator Storefront &bull; ${escapeHtml(input.orderDateFormatted)}
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #0f172a; font-weight: 600;">
                ${escapeHtml(greeting)}
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                Thank you for your purchase! Your payment has been confirmed and your digital assets are ready for instant download below.
              </p>

              <!-- Download Section -->
              <div style="margin-bottom: 32px;">
                <div style="font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #4f46e5; margin-bottom: 12px;">
                  Your Digital Files
                </div>
                ${downloadCardsHtml}
              </div>

              <!-- Order Summary Section -->
              <div style="background-color: #fafafa; border: 1px solid #f1f5f9; border-radius: 12px; padding: 20px;">
                <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 12px;">
                  Order Summary (Order #${input.orderId.slice(0, 8)})
                </div>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 16px;">
                  ${itemsRowsHtml}
                </table>

                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding: 4px 0; color: #64748b; font-size: 13px;">Subtotal</td>
                    <td style="padding: 4px 0; color: #0f172a; font-size: 13px; font-weight: 500; text-align: right;">${escapeHtml(input.subtotalFormatted)}</td>
                  </tr>
                  ${discountRowHtml}
                  <tr>
                    <td style="padding: 4px 0; color: #64748b; font-size: 13px;">GST / Tax (18%)</td>
                    <td style="padding: 4px 0; color: #0f172a; font-size: 13px; font-weight: 500; text-align: right;">${escapeHtml(input.taxFormatted)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0 0 0; border-top: 1px solid #e2e8f0; color: #0f172a; font-size: 16px; font-weight: 700;">Total Paid</td>
                    <td style="padding: 12px 0 0 0; border-top: 1px solid #e2e8f0; color: #0f172a; font-size: 16px; font-weight: 700; text-align: right;">${escapeHtml(input.totalFormatted)}</td>
                  </tr>
                </table>
              </div>

              <!-- Support Note -->
              <div style="margin-top: 32px; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
                Need help with your download? Reply directly to this email${input.supportEmail ? ` or contact <a href="mailto:${escapeHtml(input.supportEmail)}" style="color: #4f46e5; text-decoration: none;">${escapeHtml(input.supportEmail)}</a>` : ''}.
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
              Delivered securely via CreatorHub &bull; Digital Fulfillment Engine
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  // Fallback plain-text representation
  const textDownloadLinks = input.downloadLinks
    .map(
      (l) => `* ${l.productTitle}\n  Download: ${l.downloadUrl}\n  (Limit: ${l.maxDownloads} downloads, expires ${l.expiresAtFormatted})\n`,
    )
    .join('\n')

  const textItems = input.items
    .map((i) => `${i.title} x ${i.quantity} - ${i.totalFormatted}`)
    .join('\n')

  const text = `
${input.workspaceName} - Order Confirmed!
Order ID: #${input.orderId}
Date: ${input.orderDateFormatted}

${greeting}

Thank you for your purchase! Your digital files are ready for instant download:

${textDownloadLinks}

ORDER SUMMARY:
${textItems}
Subtotal: ${input.subtotalFormatted}
${input.discountFormatted ? `Discount: -${input.discountFormatted} (${input.couponCode ?? ''})\n` : ''}Tax / GST: ${input.taxFormatted}
Total: ${input.totalFormatted}

Need help? Contact ${input.supportEmail ?? 'support'}.
  `.trim()

  return {
    subject,
    html,
    text,
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
