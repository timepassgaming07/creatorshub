/**
 * Creator Orders Management Server Actions (Slice 7 §7.3, §7.4, §7.6, §7.7).
 *
 * Responsibilities:
 * 1. RBAC authorization check for `order.view` and `order.refund`.
 * 2. Scoped listing, search, count, and metrics aggregation.
 * 3. Complete order inspection: line items, payments, refunds, transitions, customer, and fulfillment grants.
 * 4. Manual operations: Resend delivery email receipt, extend download credits, and CSV data export.
 */
'use server'

import {
  orderId as toOrderId,
  requestId as toRequestId,
  userId as toUserId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type OrderPaymentStatus,
  type OrderStatus,
} from '@creatorhub/contracts'
import {
  auditLog,
  customers,
  fulfillment,
  orders,
  payments,
  refunds,
  workspaceMembers,
} from '@creatorhub/db'
import { authorise } from '@creatorhub/domain'

import { getDatabase } from './db'
import { issueDownloadGrants, sendPurchaseEmails, type IssuedDownload } from './delivery'
import { getServerSession } from './server-session'
import { auditOptions } from './env'

export type OrderListItemDTO = {
  readonly id: string
  readonly customerEmail: string
  readonly customerName: string | null
  readonly customerPhone: string | null
  readonly currency: string
  readonly subtotalAmount: string
  readonly discountAmount: string
  readonly taxAmount: string
  readonly totalAmount: string
  readonly status: OrderStatus
  readonly paymentStatus: OrderPaymentStatus
  readonly createdAt: string
}

export type OrderSummaryDTO = {
  readonly totalOrders: number
  readonly paidOrdersCount: number
  readonly refundedOrdersCount: number
  readonly totalGrossRevenue: string
  readonly totalRefundedAmount: string
}

export type OrderListResult =
  | {
      readonly ok: true
      readonly data: {
        readonly orders: readonly OrderListItemDTO[]
        readonly totalCount: number
        readonly summary: OrderSummaryDTO
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'ERROR'
        readonly message: string
      }
    }

export type OrderDetailsDTO = {
  readonly order: OrderListItemDTO
  readonly items: readonly {
    readonly id: string
    readonly productId: string
    readonly productTitle: string
    readonly unitAmount: string
    readonly quantity: number
    readonly subtotalAmount: string
    readonly taxAmount: string
    readonly totalAmount: string
  }[]
  readonly customer: {
    readonly id: string
    readonly email: string
    readonly name: string | null
    readonly phone: string | null
    readonly totalSpend: string
    readonly ordersCount: number
  } | null
  readonly payments: readonly {
    readonly id: string
    readonly provider: string
    readonly providerPaymentId: string
    readonly amount: string
    readonly status: string
    readonly method: string | null
    readonly capturedAt: string | null
  }[]
  readonly refunds: readonly {
    readonly id: string
    readonly amount: string
    readonly status: string
    readonly reason: string | null
    readonly createdAt: string
  }[]
  readonly transitions: readonly {
    readonly fromStatus: string
    readonly toStatus: string
    readonly actorType: string
    readonly reason: string | null
    readonly createdAt: string
  }[]
  readonly entitlements: readonly {
    readonly id: string
    readonly productId: string
    readonly status: string
    readonly grantedAt: string
    readonly downloadGrants: readonly {
      readonly id: string
      readonly assetId: string
      readonly maxDownloads: number
      readonly downloadCount: number
      readonly remainingDownloads: number
      readonly expiresAt: string
      readonly isExpired: boolean
    }[]
  }[]
}

export type OrderDetailsResult =
  | {
      readonly ok: true
      readonly data: OrderDetailsDTO
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR'
        readonly message: string
      }
    }

/**
 * Lists orders with multi-criteria filtering, search, and pagination.
 */
export async function listOrdersAction(
  rawWorkspaceId: string,
  filter: {
    readonly status?: OrderStatus | undefined
    readonly paymentStatus?: OrderPaymentStatus | undefined
    readonly query?: string | undefined
    readonly fromDate?: string | undefined
    readonly toDate?: string | undefined
    readonly limit?: number | undefined
    readonly offset?: number | undefined
  } = {},
): Promise<OrderListResult> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-list-ord-${String(Date.now())}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace.' },
      }
    }

    const authCheck = authorise(
      { userId: actorId, workspaceId: wsId, role: member.role },
      wsId,
      'order.view',
    )
    if (!authCheck.ok) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Permission denied to view orders.' },
      }
    }

    const orderFilter = {
      ...(filter.status && { status: filter.status }),
      ...(filter.paymentStatus && { paymentStatus: filter.paymentStatus }),
      ...(filter.query && { query: filter.query }),
      ...(filter.fromDate && { fromDate: new Date(filter.fromDate) }),
      ...(filter.toDate && { toDate: new Date(filter.toDate) }),
      limit: filter.limit ?? 25,
      offset: filter.offset ?? 0,
    }

    const [orderRows, totalCount, summaryData] = await Promise.all([
      orders.listOrders(scope, orderFilter),
      orders.countOrders(scope, orderFilter),
      orders.getOrderSummary(scope),
    ])

    const formattedOrders: OrderListItemDTO[] = orderRows.map((o) => ({
      id: o.id,
      customerEmail: o.customerEmail,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      currency: o.currency,
      subtotalAmount: o.subtotalAmount.toString(),
      discountAmount: o.discountAmount.toString(),
      taxAmount: o.taxAmount.toString(),
      totalAmount: o.totalAmount.toString(),
      status: o.status,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt.toISOString(),
    }))

    return {
      ok: true,
      data: {
        orders: formattedOrders,
        totalCount,
        summary: {
          totalOrders: summaryData.totalOrders,
          paidOrdersCount: summaryData.paidOrdersCount,
          refundedOrdersCount: summaryData.refundedOrdersCount,
          totalGrossRevenue: summaryData.totalGrossRevenue.toString(),
          totalRefundedAmount: summaryData.totalRefundedAmount.toString(),
        },
      },
    }
  })
}

/**
 * Retrieves comprehensive details and audit trail for a single order.
 */
export async function getOrderDetailsAction(
  rawWorkspaceId: string,
  rawOrderId: string,
): Promise<OrderDetailsResult> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const ordId = toOrderId(rawOrderId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-ord-detail-${String(Date.now())}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace.' },
      }
    }

    const authCheck = authorise(
      { userId: actorId, workspaceId: wsId, role: member.role },
      wsId,
      'order.view',
    )
    if (!authCheck.ok) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Permission denied to view order details.' },
      }
    }

    const orderWithItems = await orders.findOrderWithItems(scope, ordId)
    if (!orderWithItems) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Order not found.' } }
    }

    const { order, items } = orderWithItems
    const [paymentsList, refundsList, transitionsList, entitlementsList, customerRecord] =
      await Promise.all([
        payments.listPaymentsForOrder(scope, ordId),
        refunds.listRefundsForOrder(scope, ordId),
        orders.listOrderTransitions(scope, ordId),
        fulfillment.findEntitlementsByOrderId(scope, ordId),
        order.customerId
          ? customers.findCustomerById(scope, order.customerId as never)
          : customers.findCustomerByEmail(scope, order.customerEmail),
      ])

    // Load download grants for each entitlement
    const formattedEntitlements = await Promise.all(
      entitlementsList.map(async (ent) => {
        const grants = await fulfillment.findDownloadGrantsByEntitlementId(scope, ent.id)
        const now = new Date().getTime()

        return {
          id: ent.id,
          productId: ent.productId,
          status: ent.status,
          grantedAt: ent.grantedAt.toISOString(),
          downloadGrants: grants.map((g) => ({
            id: g.id,
            assetId: g.assetId,
            maxDownloads: g.maxDownloads,
            downloadCount: g.downloadCount,
            remainingDownloads: Math.max(0, g.maxDownloads - g.downloadCount),
            expiresAt: g.expiresAt.toISOString(),
            isExpired: g.expiresAt.getTime() <= now,
          })),
        }
      }),
    )

    return {
      ok: true,
      data: {
        order: {
          id: order.id,
          customerEmail: order.customerEmail,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          currency: order.currency,
          subtotalAmount: order.subtotalAmount.toString(),
          discountAmount: order.discountAmount.toString(),
          taxAmount: order.taxAmount.toString(),
          totalAmount: order.totalAmount.toString(),
          status: order.status,
          paymentStatus: order.paymentStatus,
          createdAt: order.createdAt.toISOString(),
        },
        items: items.map((i) => ({
          id: i.id,
          productId: i.productId,
          productTitle: i.productTitle,
          unitAmount: i.unitAmount.toString(),
          quantity: i.quantity,
          subtotalAmount: i.subtotalAmount.toString(),
          taxAmount: i.taxAmount.toString(),
          totalAmount: i.totalAmount.toString(),
        })),
        customer: customerRecord
          ? {
              id: customerRecord.id,
              email: customerRecord.email,
              name: customerRecord.name,
              phone: customerRecord.phone,
              totalSpend: customerRecord.totalSpend.toString(),
              ordersCount: customerRecord.ordersCount,
            }
          : null,
        payments: paymentsList.map((p) => ({
          id: p.id,
          provider: p.provider,
          providerPaymentId: p.providerPaymentId,
          amount: p.amount.toString(),
          status: p.status,
          method: p.method,
          capturedAt: p.capturedAt ? p.capturedAt.toISOString() : null,
        })),
        refunds: refundsList.map((r) => ({
          id: r.id,
          amount: r.amount.toString(),
          status: r.status,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
        })),
        transitions: transitionsList.map((t) => ({
          fromStatus: t.fromStatus,
          toStatus: t.toStatus,
          actorType: t.actorType,
          reason: t.reason,
          createdAt: t.createdAt.toISOString(),
        })),
        entitlements: formattedEntitlements,
      },
    }
  })
}

/**
 * Re-sends the digital purchase receipt and access link to buyer email.
 */
export async function resendFulfillmentEmailAction(
  rawWorkspaceId: string,
  rawOrderId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, message: 'Sign-in required.' }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const ordId = toOrderId(rawOrderId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-resend-${String(Date.now())}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()
  let resend: { downloads: IssuedDownload[]; orderId: string } | null = null

  const result = await db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return { ok: false, message: 'Forbidden: not a workspace member.' }
    }

    const orderWithItems = await orders.findOrderWithItems(scope, ordId)
    if (!orderWithItems) {
      return { ok: false, message: 'Order not found.' }
    }

    const { order } = orderWithItems
    if (order.status !== 'paid' && order.status !== 'partially_refunded') {
      return { ok: false, message: 'Only paid orders have downloads to resend.' }
    }
    // Fresh links: the old ones may have expired or been used up.
    const downloads = await issueDownloadGrants(scope, order.id)
    resend = { downloads, orderId: order.id }

    await auditLog.writeAuditLog(scope, auditOptions, {
      action: 'order.fulfillment_resent',
      actorType: 'user',
      actorId,
      targetType: 'order',
      targetId: ordId,
      metadata: { customerEmail: order.customerEmail },
    })

    return { ok: true, message: `New download links sent to ${order.customerEmail}.` }
  })

  // Email after the grants have committed.
  // TypeScript cannot see the assignment inside the transaction callback.
  const pending = resend as { downloads: IssuedDownload[]; orderId: string } | null
  if (result.ok && pending) {
    await sendPurchaseEmails({
      workspaceId: rawWorkspaceId,
      orderId: pending.orderId,
      downloads: pending.downloads,
      notifyCreator: false,
    })
  }
  return result
}

/**
 * Generates CSV export for orders matching filter criteria.
 */
export async function exportOrdersCsvAction(
  rawWorkspaceId: string,
  filter: {
    readonly status?: OrderStatus | undefined
    readonly fromDate?: string | undefined
    readonly toDate?: string | undefined
  } = {},
): Promise<{ ok: boolean; csv?: string; error?: string }> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: 'Sign-in required.' }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-csv-ord-${String(Date.now())}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return { ok: false, error: 'Forbidden.' }
    }

    const orderRows = await orders.listOrders(scope, {
      ...(filter.status && { status: filter.status }),
      ...(filter.fromDate && { fromDate: new Date(filter.fromDate) }),
      ...(filter.toDate && { toDate: new Date(filter.toDate) }),
      limit: 1000,
    })

    const headers = [
      'Order ID',
      'Date',
      'Customer Email',
      'Customer Name',
      'Status',
      'Payment Status',
      'Currency',
      'Subtotal',
      'Tax',
      'Total',
    ]

    const rows = orderRows.map((o) => [
      o.id,
      o.createdAt.toISOString(),
      `"${o.customerEmail.replace(/"/g, '""')}"`,
      `"${(o.customerName ?? '').replace(/"/g, '""')}"`,
      o.status,
      o.paymentStatus,
      o.currency,
      (Number(o.subtotalAmount) / 100).toFixed(2),
      (Number(o.taxAmount) / 100).toFixed(2),
      (Number(o.totalAmount) / 100).toFixed(2),
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    await auditLog.writeAuditLog(scope, auditOptions, {
      action: 'orders.exported',
      actorType: 'user',
      actorId,
      targetType: 'workspace',
      targetId: wsId,
      metadata: { count: orderRows.length },
    })

    return { ok: true, csv }
  })
}
