/**
 * Digital delivery: download grants and the emails that carry them.
 *
 * Responsibilities:
 * - Issue download grants for every file of every product on an order.
 * - After the order's transaction commits, email the buyer their receipt and
 *   links, and tell the workspace owners they made a sale.
 *
 * Emails are sent only after commit (ADR-0009: no external I/O inside a
 * transaction). A failed send is logged and swallowed: the payment is already
 * taken and the order is already fulfilled, and the creator can resend the
 * receipt from the order page, which issues fresh links.
 */
import {
  orderId as toOrderId,
  productId,
  requestId,
  workspaceContext,
  workspaceId,
} from '@creatorhub/contracts'
import {
  catalogue,
  fulfillment,
  orders,
  storefronts,
  workspaceMembers,
  workspaces,
  type RepositoryScope,
} from '@creatorhub/db'
import { formatMinorCurrency } from '@creatorhub/email'
import { isAssetDeliverable } from '@creatorhub/storage'

import { getAuthPool } from './auth'
import { getDatabase } from './db'
import { createDownloadToken } from './download-token'
import { getEmailService } from './email'
import { appUrl, storefrontUrl } from './env'

export const DOWNLOAD_LIMIT = 5
export const DOWNLOAD_LINK_DAYS = 7

export type IssuedDownload = {
  readonly token: string
  readonly url: string
  readonly productTitle: string
  readonly originalFilename: string
  readonly byteSize: string
  readonly maxDownloads: number
  readonly expiresAt: Date
}

export function downloadPageUrl(token: string): string {
  return `${appUrl()}/fulfillment/${token}`
}

/**
 * Issue a fresh grant for every deliverable file on the order. Runs inside the
 * caller's transaction; the raw tokens exist only in the return value.
 */
export async function issueDownloadGrants(
  scope: RepositoryScope,
  rawOrderId: string,
): Promise<IssuedDownload[]> {
  const entitlementRows = await fulfillment.findEntitlementsByOrderId(scope, toOrderId(rawOrderId))
  const issued: IssuedDownload[] = []
  const expiresAt = new Date(Date.now() + DOWNLOAD_LINK_DAYS * 24 * 60 * 60 * 1000)

  for (const entitlement of entitlementRows) {
    if (entitlement.status !== 'active') continue
    const product = await catalogue.findProductById(scope, productId(entitlement.productId))
    const files = await catalogue.listAssetsForProduct(scope, productId(entitlement.productId))

    for (const file of files) {
      // Cover and gallery images are shop-window material, not what was bought.
      if (file.productAsset.role !== 'deliverable' || !isAssetDeliverable(file.asset)) continue
      const { token, tokenHash } = createDownloadToken(scope.context.workspaceId)
      await fulfillment.createDownloadGrant(scope, {
        entitlementId: entitlement.id,
        assetId: file.asset.id,
        tokenHash,
        maxDownloads: DOWNLOAD_LIMIT,
        expiresAt,
      })
      issued.push({
        token,
        url: downloadPageUrl(token),
        productTitle: product?.title ?? file.asset.originalFilename,
        originalFilename: file.asset.originalFilename,
        byteSize: file.asset.byteSize.toString(),
        maxDownloads: DOWNLOAD_LIMIT,
        expiresAt,
      })
    }
  }

  return issued
}

/** Owner and admin email addresses, for sale notifications. */
export async function notificationRecipients(scope: RepositoryScope): Promise<string[]> {
  const members = await workspaceMembers.listMembers(scope)
  const ids = members.filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.userId)
  if (ids.length === 0) return []
  const result = await getAuthPool().query<{ email: string }>(
    'SELECT email FROM users WHERE id = ANY($1)',
    [ids],
  )
  return result.rows.map((row) => row.email)
}

/**
 * Email the buyer their receipt and download links, and the owners a sale
 * notice. Call after the fulfilling transaction has committed.
 */
export async function sendPurchaseEmails(input: {
  readonly workspaceId: string
  readonly orderId: string
  readonly downloads: readonly IssuedDownload[]
  readonly notifyCreator?: boolean
}): Promise<void> {
  try {
    const context = workspaceContext({
      workspaceId: workspaceId(input.workspaceId),
      requestId: requestId(`req-mail-${input.orderId.slice(-12)}`),
    })

    const details = await getDatabase().withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const orderWithItems = await orders.findOrderWithItems(scope, toOrderId(input.orderId))
      if (!orderWithItems) return null
      const ws = await workspaces.findCurrentWorkspace(scope)
      const store = await storefronts.findStorefrontByWorkspaceId(scope)
      const recipients = input.notifyCreator === false ? [] : await notificationRecipients(scope)
      return { ...orderWithItems, ws, store, recipients }
    })

    if (!details) return
    const { order, items, ws, store, recipients } = details
    const brand = store?.title ?? ws?.name ?? 'CreatorHub'
    const email = getEmailService()

    await email.sendOrderReceipt({
      workspaceName: brand,
      storefrontUrl: store ? storefrontUrl(store.subdomain) : undefined,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      orderId: order.id,
      orderDate: order.createdAt,
      items: items.map((item) => ({
        title: item.productTitle,
        quantity: item.quantity,
        unitAmountMinor: item.unitAmount,
        totalAmountMinor: item.totalAmount,
      })),
      subtotalAmountMinor: order.subtotalAmount,
      discountAmountMinor: order.discountAmount,
      taxAmountMinor: order.taxAmount,
      totalAmountMinor: order.totalAmount,
      currency: order.currency,
      downloadLinks: input.downloads.map((d) => ({
        productTitle: d.productTitle,
        downloadUrl: d.url,
        maxDownloads: d.maxDownloads,
        expiresAt: d.expiresAt,
      })),
    })

    if (recipients.length > 0) {
      await email.sendSaleNotification({
        to: recipients,
        workspaceName: brand,
        productSummary:
          items.length === 1
            ? (items[0]?.productTitle ?? 'a product')
            : `${String(items.length)} products`,
        amountFormatted:
          order.totalAmount === 0n
            ? 'free'
            : formatMinorCurrency({ amountMinor: order.totalAmount, currency: order.currency }),
        customerEmail: order.customerEmail,
        orderUrl: `${appUrl()}/workspaces/${input.workspaceId}/orders/${order.id}`,
      })
    }
  } catch (error) {
    // Logged, not thrown: see the file comment.
    console.error('[delivery] purchase email failed', {
      orderId: input.orderId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
