/**
 * Orders Repository — Tenant-scoped order persistence and state transitions (Slice 5 §5.2, §5.3).
 *
 * Responsibilities:
 * 1. Order creation with items in a single transaction.
 * 2. Order retrieval and filtering by workspace.
 * 3. Atomic status transitions and audit log records.
 * 4. Multi-tenancy enforcement: All queries and mutations are bound to `scope.context.workspaceId`.
 */
import type {
  OrderId,
  OrderPaymentStatus,
  OrderStatus,
  OrderTransitionActorType,
} from '@creatorhub/contracts'
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import {
  type NewOrderItemRecord,
  type NewOrderRecord,
  type NewOrderTransitionRecord,
  type OrderItemRecord,
  type OrderRecord,
  type OrderTransitionRecord,
  orderItems,
  orders,
  orderTransitions,
  refunds,
} from '../schema/index.js'

export type {
  NewOrderItemRecord,
  NewOrderRecord,
  NewOrderTransitionRecord,
  OrderItemRecord,
  OrderRecord,
  OrderTransitionRecord,
}

export type CreateOrderItemInput = {
  readonly productId: string
  readonly variantId?: string | null
  readonly productTitle: string
  readonly variantTitle?: string | null
  readonly unitAmount: bigint
  readonly quantity: number
  readonly subtotalAmount: bigint
  readonly discountAmount?: bigint
  readonly taxAmount?: bigint
  readonly totalAmount: bigint
  readonly metadata?: Record<string, unknown>
}

export type CreateOrderInput = {
  readonly customerId?: string | null
  readonly customerEmail: string
  readonly customerName?: string | null
  readonly customerPhone?: string | null
  readonly currency: string
  readonly subtotalAmount: bigint
  readonly discountAmount?: bigint
  readonly taxAmount?: bigint
  readonly totalAmount: bigint
  readonly status?: OrderStatus
  readonly paymentStatus?: OrderPaymentStatus
  readonly checkoutSessionId?: string | null
  readonly metadata?: Record<string, unknown>
  readonly items: readonly CreateOrderItemInput[]
}

export type OrderWithItems = {
  readonly order: OrderRecord
  readonly items: readonly OrderItemRecord[]
}

/**
 * Creates an order and its associated line items inside the repository transaction scope.
 */
export async function createOrder(
  scope: RepositoryScope,
  input: CreateOrderInput,
): Promise<OrderWithItems> {
  const [createdOrder] = await scope.tx
    .insert(orders)
    .values(
      insertValues<NewOrderRecord>(scope, {
        customerId: input.customerId ?? null,
        customerEmail: input.customerEmail.toLowerCase(),
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        currency: input.currency.toUpperCase(),
        subtotalAmount: input.subtotalAmount,
        discountAmount: input.discountAmount ?? 0n,
        taxAmount: input.taxAmount ?? 0n,
        totalAmount: input.totalAmount,
        status: input.status ?? 'pending',
        paymentStatus: input.paymentStatus ?? 'unpaid',
        checkoutSessionId: input.checkoutSessionId ?? null,
        metadata: input.metadata ?? {},
      }),
    )
    .returning()

  if (!createdOrder) {
    throw new Error(`Failed to create order for workspace '${scope.context.workspaceId}'`)
  }

  const createdItems: OrderItemRecord[] = []

  if (input.items.length > 0) {
    const itemValues = input.items.map((item) =>
      insertValues<NewOrderItemRecord>(scope, {
        orderId: createdOrder.id,
        productId: item.productId,
        variantId: item.variantId ?? null,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle ?? null,
        unitAmount: item.unitAmount,
        quantity: item.quantity,
        subtotalAmount: item.subtotalAmount,
        discountAmount: item.discountAmount ?? 0n,
        taxAmount: item.taxAmount ?? 0n,
        totalAmount: item.totalAmount,
        metadata: item.metadata ?? {},
      }),
    )

    const items = await scope.tx.insert(orderItems).values(itemValues).returning()
    createdItems.push(...items)
  }

  return {
    order: createdOrder,
    items: createdItems,
  }
}

/**
 * Finds an order by its ID within the current tenant workspace.
 */
export async function findOrderById(
  scope: RepositoryScope,
  orderId: OrderId | string,
): Promise<OrderRecord | null> {
  const [order] = await scope.tx
    .select()
    .from(orders)
    .where(and(scoped(scope, orders), eq(orders.id, orderId)))
    .limit(1)

  return order ?? null
}

/**
 * Finds an order by checkout session ID within the current workspace.
 */
export async function findOrderByCheckoutSessionId(
  scope: RepositoryScope,
  sessionId: string,
): Promise<OrderRecord | null> {
  const [order] = await scope.tx
    .select()
    .from(orders)
    .where(and(scoped(scope, orders), eq(orders.checkoutSessionId, sessionId)))
    .limit(1)

  return order ?? null
}

/**
 * Finds an order and all of its items by order ID.
 */
export async function findOrderWithItems(
  scope: RepositoryScope,
  orderId: OrderId | string,
): Promise<OrderWithItems | null> {
  const order = await findOrderById(scope, orderId)
  if (!order) return null

  const items = await scope.tx
    .select()
    .from(orderItems)
    .where(and(scoped(scope, orderItems), eq(orderItems.orderId, order.id)))
    .orderBy(orderItems.createdAt)

  return { order, items }
}

export type OrderFilter = {
  readonly status?: OrderStatus | undefined
  readonly paymentStatus?: OrderPaymentStatus | undefined
  readonly customerId?: string | undefined
  readonly query?: string | undefined
  readonly fromDate?: Date | undefined
  readonly toDate?: Date | undefined
  readonly limit?: number | undefined
  readonly offset?: number | undefined
}

export type OrderSummary = {
  readonly totalOrders: number
  readonly paidOrdersCount: number
  readonly refundedOrdersCount: number
  readonly totalGrossRevenue: bigint
  readonly totalRefundedAmount: bigint
}

/**
 * Lists orders in the workspace with optional multi-criteria filtering, search, and pagination.
 */
export async function listOrders(
  scope: RepositoryScope,
  options: OrderFilter = {},
): Promise<readonly OrderRecord[]> {
  const conditions = []

  if (options.status) {
    conditions.push(eq(orders.status, options.status))
  }

  if (options.paymentStatus) {
    conditions.push(eq(orders.paymentStatus, options.paymentStatus))
  }

  if (options.customerId) {
    conditions.push(eq(orders.customerId, options.customerId))
  }

  if (options.query && options.query.trim().length > 0) {
    const term = `%${options.query.trim()}%`
    conditions.push(
      or(
        ilike(orders.customerEmail, term),
        ilike(orders.customerName, term),
        sql`${orders.id}::text ILIKE ${term}`,
      ),
    )
  }

  if (options.fromDate) {
    conditions.push(gte(orders.createdAt, options.fromDate))
  }

  if (options.toDate) {
    conditions.push(lte(orders.createdAt, options.toDate))
  }

  const query = scope.tx
    .select()
    .from(orders)
    .where(scoped(scope, orders, ...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0)

  return query
}

/**
 * Counts total orders matching the filter criteria.
 */
export async function countOrders(
  scope: RepositoryScope,
  options: OrderFilter = {},
): Promise<number> {
  const conditions = []

  if (options.status) {
    conditions.push(eq(orders.status, options.status))
  }

  if (options.paymentStatus) {
    conditions.push(eq(orders.paymentStatus, options.paymentStatus))
  }

  if (options.customerId) {
    conditions.push(eq(orders.customerId, options.customerId))
  }

  if (options.query && options.query.trim().length > 0) {
    const term = `%${options.query.trim()}%`
    conditions.push(
      or(
        ilike(orders.customerEmail, term),
        ilike(orders.customerName, term),
        sql`${orders.id}::text ILIKE ${term}`,
      ),
    )
  }

  if (options.fromDate) {
    conditions.push(gte(orders.createdAt, options.fromDate))
  }

  if (options.toDate) {
    conditions.push(lte(orders.createdAt, options.toDate))
  }

  const [row] = await scope.tx
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(scoped(scope, orders, ...conditions))

  return row?.count ?? 0
}

/**
 * Finds all orders placed by a customer in the current workspace.
 *
 * Orders are keyed by the buyer's email at checkout, before a customer record
 * exists, so the email matches them as well as an explicit customer id.
 */
export async function findOrdersByCustomerId(
  scope: RepositoryScope,
  customerId: string,
  email?: string,
): Promise<readonly OrderRecord[]> {
  const match = email
    ? or(
        eq(orders.customerId, customerId),
        sql`lower(${orders.customerEmail}) = ${email.trim().toLowerCase()}`,
      )
    : eq(orders.customerId, customerId)
  return scope.tx
    .select()
    .from(orders)
    .where(scoped(scope, orders, match))
    .orderBy(desc(orders.createdAt))
}

/**
 * Computes revenue and order count aggregations for creator dashboard.
 *
 * Gross revenue counts every order that was paid, including ones later
 * refunded; the refunded total is reported beside it so the view can show net.
 */
export async function getOrderSummary(scope: RepositoryScope): Promise<OrderSummary> {
  const [row] = await scope.tx
    .select({
      totalOrders: sql<number>`count(*)::int`,
      paidOrdersCount: sql<number>`count(case when ${orders.status} in ('paid', 'partially_refunded') then 1 end)::int`,
      refundedOrdersCount: sql<number>`count(case when ${orders.status} = 'refunded' then 1 end)::int`,
      totalGrossRevenue: sql<string>`coalesce(sum(case when ${orders.status} in ('paid', 'partially_refunded', 'refunded') then ${orders.totalAmount} else 0 end), 0)::text`,
    })
    .from(orders)
    .where(scoped(scope, orders))

  const [refunded] = await scope.tx
    .select({ total: sql<string>`coalesce(sum(${refunds.amount}), 0)::text` })
    .from(refunds)
    .where(scoped(scope, refunds, eq(refunds.status, 'succeeded')))

  return {
    totalOrders: row?.totalOrders ?? 0,
    paidOrdersCount: row?.paidOrdersCount ?? 0,
    refundedOrdersCount: row?.refundedOrdersCount ?? 0,
    totalGrossRevenue: BigInt(row?.totalGrossRevenue ?? '0'),
    totalRefundedAmount: BigInt(refunded?.total ?? '0'),
  }
}

/**
 * Updates order status and optionally payment status.
 */
export async function updateOrderStatus(
  scope: RepositoryScope,
  orderId: OrderId | string,
  status: OrderStatus,
  paymentStatus?: OrderPaymentStatus,
): Promise<OrderRecord> {
  const updateData: Partial<NewOrderRecord> = {
    status,
    updatedAt: new Date(),
  }

  if (paymentStatus !== undefined) {
    updateData.paymentStatus = paymentStatus
  }

  const [updated] = await scope.tx
    .update(orders)
    .set(updateData)
    .where(and(scoped(scope, orders), eq(orders.id, orderId)))
    .returning()

  if (!updated) {
    throw new Error(`Order '${orderId}' not found in workspace '${scope.context.workspaceId}'`)
  }

  return updated
}

/**
 * Store the payment provider's session id on an order.
 *
 * The provider session is created after the order commits (no external I/O
 * inside a transaction), so the id arrives in a second, short transaction.
 */
export async function setCheckoutSession(
  scope: RepositoryScope,
  orderId: OrderId | string,
  checkoutSessionId: string,
): Promise<OrderRecord> {
  const [updated] = await scope.tx
    .update(orders)
    .set({ checkoutSessionId, updatedAt: new Date() })
    .where(and(scoped(scope, orders), eq(orders.id, orderId)))
    .returning()

  if (!updated) {
    throw new Error(`Order '${orderId}' not found in workspace '${scope.context.workspaceId}'`)
  }

  return updated
}

/**
 * Records an order transition event.
 */
export async function recordOrderTransition(
  scope: RepositoryScope,
  input: {
    readonly orderId: OrderId | string
    readonly fromStatus: OrderStatus
    readonly toStatus: OrderStatus
    readonly actorType: OrderTransitionActorType
    readonly actorId?: string | null
    readonly reason?: string | null
    readonly metadata?: Record<string, unknown>
  },
): Promise<OrderTransitionRecord> {
  const [created] = await scope.tx
    .insert(orderTransitions)
    .values(
      insertValues<NewOrderTransitionRecord>(scope, {
        orderId: input.orderId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
      }),
    )
    .returning()

  if (!created) {
    throw new Error(
      `Failed to record transition for order '${input.orderId}' in workspace '${scope.context.workspaceId}'`,
    )
  }

  return created
}

/**
 * Lists chronological state transitions for an order.
 */
export async function listOrderTransitions(
  scope: RepositoryScope,
  orderId: OrderId | string,
): Promise<readonly OrderTransitionRecord[]> {
  return scope.tx
    .select()
    .from(orderTransitions)
    .where(and(scoped(scope, orderTransitions), eq(orderTransitions.orderId, orderId)))
    .orderBy(orderTransitions.createdAt)
}
