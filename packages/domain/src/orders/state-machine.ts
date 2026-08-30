/**
 * Order State Machine (Slice 5 §5.3).
 *
 * Responsibilities:
 * 1. Pure, deterministic order lifecycle transitions.
 * 2. Pure, deterministic payment status transitions.
 * 3. Actor-based transition authorization.
 * 4. Terminal and paid state predicates.
 *
 * Invariants:
 * - Direct transition graph with no hidden or implicit state mutations.
 * - All results return `Result<T, DomainError>`.
 */
import type {
  OrderPaymentStatus,
  OrderStatus,
  OrderTransitionActorType,
} from '@creatorhub/contracts'

import { type DomainError, domainError, err, ok, type Result } from '../result.js'

export const INVALID_ORDER_TRANSITION = 'INVALID_ORDER_TRANSITION'
export const INVALID_PAYMENT_TRANSITION = 'INVALID_PAYMENT_TRANSITION'
export const UNAUTHORIZED_ORDER_TRANSITION = 'UNAUTHORIZED_ORDER_TRANSITION'

export type InvalidOrderTransitionError = DomainError & {
  readonly code: typeof INVALID_ORDER_TRANSITION
  readonly from: OrderStatus
  readonly to: OrderStatus
}

export type InvalidPaymentTransitionError = DomainError & {
  readonly code: typeof INVALID_PAYMENT_TRANSITION
  readonly from: OrderPaymentStatus
  readonly to: OrderPaymentStatus
}

export type UnauthorizedOrderTransitionError = DomainError & {
  readonly code: typeof UNAUTHORIZED_ORDER_TRANSITION
  readonly from: OrderStatus
  readonly to: OrderStatus
  readonly actorType: OrderTransitionActorType
}

type OrderTransitionRule = {
  readonly targets: readonly OrderStatus[]
  readonly actorPermissions: Readonly<
    Partial<Record<OrderStatus, readonly OrderTransitionActorType[]>>
  >
}

export const ORDER_TRANSITION_GRAPH: Readonly<Record<OrderStatus, OrderTransitionRule>> = {
  pending: {
    targets: ['requires_payment', 'processing', 'cancelled', 'failed'],
    actorPermissions: {
      requires_payment: ['customer', 'system'],
      processing: ['customer', 'system', 'webhook'],
      cancelled: ['customer', 'member', 'system'],
      failed: ['system', 'webhook'],
    },
  },
  requires_payment: {
    targets: ['processing', 'paid', 'failed', 'cancelled'],
    actorPermissions: {
      processing: ['customer', 'system', 'webhook'],
      paid: ['webhook', 'system'],
      failed: ['webhook', 'system'],
      cancelled: ['customer', 'member', 'system'],
    },
  },
  processing: {
    targets: ['paid', 'failed', 'cancelled'],
    actorPermissions: {
      paid: ['webhook', 'system'],
      failed: ['webhook', 'system'],
      cancelled: ['customer', 'member', 'system'],
    },
  },
  paid: {
    targets: ['refunded', 'partially_refunded'],
    actorPermissions: {
      refunded: ['member', 'webhook', 'system'],
      partially_refunded: ['member', 'webhook', 'system'],
    },
  },
  partially_refunded: {
    targets: ['partially_refunded', 'refunded'],
    actorPermissions: {
      partially_refunded: ['member', 'webhook', 'system'],
      refunded: ['member', 'webhook', 'system'],
    },
  },
  failed: {
    targets: ['pending', 'requires_payment'],
    actorPermissions: {
      pending: ['customer', 'system'],
      requires_payment: ['customer', 'system'],
    },
  },
  cancelled: {
    targets: [],
    actorPermissions: {},
  },
  refunded: {
    targets: [],
    actorPermissions: {},
  },
}

export const PAYMENT_STATUS_TRANSITION_GRAPH: Readonly<
  Record<OrderPaymentStatus, readonly OrderPaymentStatus[]>
> = {
  unpaid: ['authorized', 'paid', 'failed'],
  authorized: ['paid', 'failed'],
  paid: ['partially_refunded', 'refunded'],
  partially_refunded: ['partially_refunded', 'refunded'],
  failed: ['unpaid'],
  refunded: [],
}

/**
 * Checks whether an order status transition is structurally valid.
 */
export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
  actorType?: OrderTransitionActorType,
): boolean {
  const rule = ORDER_TRANSITION_GRAPH[from]
  if (!rule.targets.includes(to)) {
    return false
  }

  if (actorType) {
    const allowedActors = rule.actorPermissions[to]
    if (!allowedActors?.includes(actorType)) {
      return false
    }
  }

  return true
}

/**
 * Attempts an order status transition with actor validation.
 */
export function transitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
  actorType: OrderTransitionActorType,
): Result<OrderStatus, InvalidOrderTransitionError | UnauthorizedOrderTransitionError> {
  const rule = ORDER_TRANSITION_GRAPH[from]
  if (!rule.targets.includes(to)) {
    return err({
      ...domainError({
        code: INVALID_ORDER_TRANSITION,
        title: 'Invalid Order Transition',
        detail: `Cannot transition order status from '${from}' to '${to}'.`,
        action: 'Ensure the order is in a valid state before attempting transition.',
      }),
      code: INVALID_ORDER_TRANSITION,
      from,
      to,
    })
  }

  const allowedActors = rule.actorPermissions[to]
  if (!allowedActors?.includes(actorType)) {
    return err({
      ...domainError({
        code: UNAUTHORIZED_ORDER_TRANSITION,
        title: 'Unauthorized Order Transition',
        detail: `Actor '${actorType}' is not authorized to transition order status from '${from}' to '${to}'.`,
        action: 'Use an authorized role or service to trigger this transition.',
      }),
      code: UNAUTHORIZED_ORDER_TRANSITION,
      from,
      to,
      actorType,
    })
  }

  return ok(to)
}

/**
 * Checks whether a payment status transition is structurally valid.
 */
export function canTransitionPaymentStatus(
  from: OrderPaymentStatus,
  to: OrderPaymentStatus,
): boolean {
  const allowed = PAYMENT_STATUS_TRANSITION_GRAPH[from]
  return allowed.includes(to)
}

/**
 * Attempts a payment status transition.
 */
export function transitionPaymentStatus(
  from: OrderPaymentStatus,
  to: OrderPaymentStatus,
): Result<OrderPaymentStatus, InvalidPaymentTransitionError> {
  if (!canTransitionPaymentStatus(from, to)) {
    return err({
      ...domainError({
        code: INVALID_PAYMENT_TRANSITION,
        title: 'Invalid Payment Transition',
        detail: `Cannot transition payment status from '${from}' to '${to}'.`,
        action: 'Check payment status and try again.',
      }),
      code: INVALID_PAYMENT_TRANSITION,
      from,
      to,
    })
  }

  return ok(to)
}

/**
 * Predicate checking if an order status is terminal.
 */
export function isOrderTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITION_GRAPH[status].targets.length === 0
}

/**
 * Predicate checking if a payment status is terminal.
 */
export function isPaymentTerminal(status: OrderPaymentStatus): boolean {
  return PAYMENT_STATUS_TRANSITION_GRAPH[status].length === 0
}

/**
 * Predicate checking if an order is considered paid and eligible for entitlement fulfillment.
 */
export function isOrderPaid(status: OrderStatus): boolean {
  return status === 'paid' || status === 'partially_refunded'
}
