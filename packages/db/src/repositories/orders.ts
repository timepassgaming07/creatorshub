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
import { and, desc, eq } from 'drizzle-orm'

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
} from '../schema/index.js'

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

/**
 * Lists orders for the current workspace with optional status filter.
 */
export async function listOrders(
  scope: RepositoryScope,
  options: {
    readonly status?: OrderStatus
    readonly limit?: number
    readonly offset?: number
  } = {},
): Promise<readonly OrderRecord[]> {
  const conditions = [scoped(scope, orders)]

  if (options.status) {
    conditions.push(eq(orders.status, options.status))
  }

  const query = scope.tx
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0)

  return query
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
