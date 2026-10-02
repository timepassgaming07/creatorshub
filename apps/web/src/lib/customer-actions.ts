/**
 * Creator Customers Management Server Actions (Slice 7 §7.5, §7.6, §7.7).
 *
 * Responsibilities:
 * 1. RBAC authorization for `customer.view` and `customer.manage`.
 * 2. Multi-tenant customer directory search, spend filtering, and pagination.
 * 3. Customer detail inspection: lifetime value, order history, active digital entitlements.
 * 4. Tenant-scoped CSV data export.
 */
'use server'

import {
  customerId as toCustomerId,
  requestId as toRequestId,
  userId as toUserId,
  workspaceContext,
  workspaceId as toWorkspaceId,
} from '@creatorhub/contracts'
import { auditLog, customers, fulfillment, orders, workspaceMembers } from '@creatorhub/db'
import { authorise } from '@creatorhub/domain'

import { getDatabase } from './db'
import { getServerSession } from './server-session'
import { auditOptions } from './env'

export type CustomerListItemDTO = {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly phone: string | null
  readonly totalSpend: string
  readonly ordersCount: number
  readonly firstSeenAt: string
  readonly lastSeenAt: string
}

export type CustomerSummaryDTO = {
  readonly totalCustomers: number
  readonly totalLifetimeValue: string
  readonly averageOrderValue: string
  readonly repeatCustomersCount: number
}

export type CustomerListResult =
  | {
      readonly ok: true
      readonly data: {
        readonly customers: readonly CustomerListItemDTO[]
        readonly totalCount: number
        readonly summary: CustomerSummaryDTO
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'ERROR'
        readonly message: string
      }
    }

export type CustomerDetailsDTO = {
  readonly customer: CustomerListItemDTO
  readonly orders: readonly {
    readonly id: string
    readonly totalAmount: string
    readonly currency: string
    readonly status: string
    readonly paymentStatus: string
    readonly createdAt: string
  }[]
  readonly entitlements: readonly {
    readonly id: string
    readonly productId: string
    readonly status: string
    readonly grantedAt: string
  }[]
}

export type CustomerDetailsResult =
  | {
      readonly ok: true
      readonly data: CustomerDetailsDTO
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR'
        readonly message: string
      }
    }

/**
 * Lists customers matching search query, spend threshold, and pagination.
 */
export async function listCustomersAction(
  rawWorkspaceId: string,
  filter: {
    readonly query?: string | undefined
    readonly minSpend?: string | undefined
    readonly limit?: number | undefined
    readonly offset?: number | undefined
  } = {},
): Promise<CustomerListResult> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-list-cust-${String(Date.now())}`)
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
      'customer.view',
    )
    if (!authCheck.ok) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Permission denied to view customers.' },
      }
    }

    const customerFilter = {
      ...(filter.query && { query: filter.query }),
      ...(filter.minSpend && { minSpend: BigInt(filter.minSpend) }),
      limit: filter.limit ?? 25,
      offset: filter.offset ?? 0,
    }

    const [customerRows, totalCount, summaryData] = await Promise.all([
      customers.listCustomers(scope, customerFilter),
      customers.countCustomers(scope, customerFilter),
      customers.getCustomerSummary(scope),
    ])

    const formattedCustomers: CustomerListItemDTO[] = customerRows.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      phone: c.phone,
      totalSpend: c.totalSpend.toString(),
      ordersCount: c.ordersCount,
      firstSeenAt: c.firstSeenAt.toISOString(),
      lastSeenAt: c.lastSeenAt.toISOString(),
    }))

    return {
      ok: true,
      data: {
        customers: formattedCustomers,
        totalCount,
        summary: {
          totalCustomers: summaryData.totalCustomers,
          totalLifetimeValue: summaryData.totalLifetimeValue.toString(),
          averageOrderValue: summaryData.averageOrderValue.toString(),
          repeatCustomersCount: summaryData.repeatCustomersCount,
        },
      },
    }
  })
}

/**
 * Retrieves comprehensive details, orders history, and active entitlements for a single customer.
 */
export async function getCustomerDetailsAction(
  rawWorkspaceId: string,
  rawCustomerId: string,
): Promise<CustomerDetailsResult> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const custId = toCustomerId(rawCustomerId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-cust-detail-${String(Date.now())}`)
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
      'customer.view',
    )
    if (!authCheck.ok) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Permission denied to view customer details.' },
      }
    }

    const customerRecord = await customers.findCustomerById(scope, custId)
    if (!customerRecord) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Customer not found.' } }
    }

    const [customerOrders, entitlementsList] = await Promise.all([
      orders.findOrdersByCustomerId(scope, customerRecord.id, customerRecord.email),
      fulfillment.findEntitlementsByCustomerEmail(scope, customerRecord.email),
    ])

    return {
      ok: true,
      data: {
        customer: {
          id: customerRecord.id,
          email: customerRecord.email,
          name: customerRecord.name,
          phone: customerRecord.phone,
          totalSpend: customerRecord.totalSpend.toString(),
          ordersCount: customerRecord.ordersCount,
          firstSeenAt: customerRecord.firstSeenAt.toISOString(),
          lastSeenAt: customerRecord.lastSeenAt.toISOString(),
        },
        orders: customerOrders.map((o) => ({
          id: o.id,
          totalAmount: o.totalAmount.toString(),
          currency: o.currency,
          status: o.status,
          paymentStatus: o.paymentStatus,
          createdAt: o.createdAt.toISOString(),
        })),
        entitlements: entitlementsList.map((e) => ({
          id: e.id,
          productId: e.productId,
          status: e.status,
          grantedAt: e.grantedAt.toISOString(),
        })),
      },
    }
  })
}

/**
 * Exports customer directory to a CSV file.
 */
export async function exportCustomersCsvAction(
  rawWorkspaceId: string,
): Promise<{ ok: boolean; csv?: string; error?: string }> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: 'Sign-in required.' }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-csv-cust-${String(Date.now())}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return { ok: false, error: 'Forbidden.' }
    }

    const customerRows = await customers.listCustomers(scope, { limit: 1000 })

    const headers = [
      'Customer ID',
      'Email',
      'Name',
      'Phone',
      'Total Spend',
      'Orders Count',
      'First Purchase',
      'Last Purchase',
    ]

    const rows = customerRows.map((c) => [
      c.id,
      `"${c.email.replace(/"/g, '""')}"`,
      `"${(c.name ?? '').replace(/"/g, '""')}"`,
      `"${(c.phone ?? '').replace(/"/g, '""')}"`,
      (Number(c.totalSpend) / 100).toFixed(2),
      c.ordersCount,
      c.firstSeenAt.toISOString(),
      c.lastSeenAt.toISOString(),
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    await auditLog.writeAuditLog(scope, auditOptions, {
      action: 'customers.exported',
      actorType: 'user',
      actorId,
      targetType: 'workspace',
      targetId: wsId,
      metadata: { count: customerRows.length },
    })

    return { ok: true, csv }
  })
}
