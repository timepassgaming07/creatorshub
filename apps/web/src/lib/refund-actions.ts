/**
 * Server Actions for Workspace Order Refunds (Slice 5 §5.10).
 *
 * Responsibilities:
 * 1. Authorise actor with `order.refund` permission using `authorise(membership, workspaceId, 'order.refund')`.
 * 2. Execute refund via payment provider port if available.
 * 3. Atomically persist refund, update order status, and write double-entry ledger postings.
 * 4. Structured error reporting via `ActionResponse<T>`.
 */
'use server'

import { randomUUID } from 'node:crypto'
import {
  orderIdSchema,
  requestId,
  userId,
  workspaceContext,
  workspaceIdSchema,
  type WorkspaceId,
} from '@creatorhub/contracts'
import { orders, payments, workspaceMembers } from '@creatorhub/db'
import { authorise, type Membership, type Permission } from '@creatorhub/domain'
import { z } from 'zod'

import { getDatabase } from './db'
import { fulfillRefund } from './refund-fulfillment'
import { getServerSession } from './server-session'

const refundOrderInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  orderId: orderIdSchema,
  amount: z.string().regex(/^\d+$/, 'Amount must be an integer string in minor units'),
  reason: z.string().max(500).optional(),
})

export type RefundOrderInput = z.infer<typeof refundOrderInputSchema>

export type RefundOrderActionResult = {
  readonly refundId: string
  readonly orderId: string
  readonly status: string
  readonly amount: string
  readonly isFullRefund: boolean
  readonly transactionId: string
}

export type ActionError = {
  readonly code: string
  readonly title: string
  readonly detail: string
  readonly action?: string | undefined
  readonly status: 400 | 401 | 403 | 404 | 500
}

export type ActionResponse<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ActionError }

async function requireAuthorizedWorkspace(
  wIdStr: string,
  permission: Permission,
): Promise<
  | {
      readonly authorized: true
      readonly user: { readonly id: string; readonly email: string }
      readonly workspaceId: WorkspaceId
      readonly membership: Membership
    }
  | { readonly authorized: false; readonly response: ActionResponse<never> }
> {
  const session = await getServerSession()
  if (!session) {
    return {
      authorized: false,
      response: {
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          title: 'Authentication Required',
          detail: 'You must be signed in to perform this action.',
          action: 'Sign in and try again.',
          status: 401,
        },
      },
    }
  }

  const wIdParsed = workspaceIdSchema.safeParse(wIdStr)
  if (!wIdParsed.success) {
    return {
      authorized: false,
      response: {
        success: false,
        error: {
          code: 'INVALID_WORKSPACE_ID',
          title: 'Invalid Workspace',
          detail: 'The provided workspace identifier is malformed.',
          status: 400,
        },
      },
    }
  }

  const wId = wIdParsed.data
  const uId = userId(session.user.id)
  const reqId = requestId(`req-rf-${randomUUID().slice(0, 8)}`)

  const context = workspaceContext({
    workspaceId: wId,
    actorId: uId,
    requestId: reqId,
  })

  const db = getDatabase()
  const memberRow = await db.withWorkspace(context, (tx) =>
    workspaceMembers.findMemberByUserId({ tx, context }, uId),
  )

  if (!memberRow) {
    return {
      authorized: false,
      response: {
        success: false,
        error: {
          code: 'WORKSPACE_NOT_FOUND',
          title: 'Workspace Not Found',
          detail: 'The requested workspace was not found or you do not have access.',
          status: 404,
        },
      },
    }
  }

  const membership: Membership = {
    userId: uId,
    workspaceId: wId,
    role: memberRow.role,
  }

  const authz = authorise(membership, wId, permission)
  if (!authz.ok) {
    return {
      authorized: false,
      response: {
        success: false,
        error: {
          code: authz.error.code,
          title: authz.error.title,
          detail: authz.error.detail,
          action: authz.error.action,
          status: 403,
        },
      },
    }
  }

  return {
    authorized: true,
    user: session.user,
    workspaceId: wId,
    membership,
  }
}

/**
 * Initiates a full or partial refund for a paid order.
 */
export async function refundOrderAction(
  rawInput: RefundOrderInput,
): Promise<ActionResponse<RefundOrderActionResult>> {
  const parsed = refundOrderInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        title: 'Invalid refund input',
        detail: parsed.error.issues.map((i) => i.message).join(', '),
        status: 400,
      },
    }
  }

  const { workspaceId: wsIdStr, orderId: ordIdStr, amount: amountStr, reason } = parsed.data
  const refundAmount = BigInt(amountStr)

  if (refundAmount <= 0n) {
    return {
      success: false,
      error: {
        code: 'INVALID_AMOUNT',
        title: 'Invalid refund amount',
        detail: 'Refund amount must be greater than zero.',
        status: 400,
      },
    }
  }

  const authCheck = await requireAuthorizedWorkspace(wsIdStr, 'order.refund')
  if (!authCheck.authorized) {
    return authCheck.response
  }

  const { workspaceId: wId, membership } = authCheck
  const reqId = requestId(`req-rf-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: wId,
    actorId: membership.userId,
    requestId: reqId,
  })

  const db = getDatabase()

  try {
    const result = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const ord = await orders.findOrderById(scope, ordIdStr)
      if (!ord) {
        throw new Error(`Order '${ordIdStr}' not found.`)
      }

      // Find captured payment
      const existingPayments = await payments.listPaymentsForOrder(scope, ord.id)
      const capturedPayment = existingPayments.find((p) => p.status === 'captured')
      if (!capturedPayment) {
        throw new Error(`No captured payment found for order '${ordIdStr}'.`)
      }

      const providerRefundId = `rfnd_${capturedPayment.provider}_${randomUUID().slice(0, 12)}`

      const fulfillRes = await fulfillRefund(scope, {
        orderId: ord.id,
        paymentId: capturedPayment.id,
        providerRefundId,
        amount: refundAmount,
        currency: ord.currency,
        reason: reason ?? 'Creator initiated refund',
        initiatedByUserId: membership.userId,
      })

      return fulfillRes
    })

    return {
      success: true,
      data: {
        refundId: result.refund.id,
        orderId: result.order.id,
        status: result.order.status,
        amount: result.refund.amount.toString(),
        isFullRefund: result.isFullRefund,
        transactionId: result.transactionId,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'REFUND_FAILED',
        title: 'Refund processing failed',
        detail:
          error instanceof Error
            ? error.message
            : 'Unknown error occurred while processing refund.',
        status: 400,
      },
    }
  }
}
