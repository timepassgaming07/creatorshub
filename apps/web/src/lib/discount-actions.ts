/**
 * Server actions for discount codes: create one, pause it, resume it.
 *
 * Codes are never deleted. An order remembers the code it used, and keeping
 * the row keeps that history readable and the code reserved.
 */
'use server'

import {
  couponCodeSchema,
  currency as toCurrency,
  discountId as toDiscountId,
  productId as toProductId,
} from '@creatorhub/contracts'
import { auditLog, catalogue, discounts } from '@creatorhub/db'
import { z } from 'zod'

import { auditOptions } from './env'
import { parsePriceToMinor } from './format'
import { ActionFailure, isUniqueViolation, memberAction, type ActionResult } from './member-action'

const createDiscountSchema = z.object({
  code: couponCodeSchema,
  type: z.enum(['percentage', 'fixed_amount']),
  value: z.string().trim().min(1, 'Enter how much the code takes off.'),
  maxUses: z.number().int().positive().nullable(),
  startsAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  minOrder: z.string().trim().nullable(),
  productIds: z.array(z.string().uuid()).max(100),
})

export type CreateDiscountFormInput = z.input<typeof createDiscountSchema>

export async function createDiscountAction(
  rawWorkspaceId: string,
  input: CreateDiscountFormInput,
): Promise<ActionResult<{ readonly id: string; readonly code: string }>> {
  const parsed = createDiscountSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error:
        issue?.path[0] === 'code'
          ? 'Codes use 2 to 50 letters, numbers, hyphens, or underscores.'
          : (issue?.message ?? 'Some fields are not valid.'),
    }
  }
  const form = parsed.data

  // Both kinds parse as a two-decimal number: 12.5 percent is 1250 basis
  // points, ₹12.50 is 1250 paise. No floating point on the way.
  const scaled = parsePriceToMinor(form.value)
  if (scaled === null || scaled <= 0n) {
    return { ok: false, error: 'Enter a positive amount, with at most two decimals.' }
  }
  if (form.type === 'percentage' && scaled > 10000n) {
    return { ok: false, error: 'A percentage discount can be at most 100%.' }
  }
  const minOrder = form.minOrder ? parsePriceToMinor(form.minOrder) : null
  if (form.minOrder && minOrder === null) {
    return { ok: false, error: 'Enter the minimum order as an amount, like 499.' }
  }
  const startsAt = form.startsAt ? new Date(form.startsAt) : null
  const expiresAt = form.expiresAt ? new Date(form.expiresAt) : null
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    return { ok: false, error: 'The end date must be after the start date.' }
  }

  return memberAction(
    'discount.create',
    rawWorkspaceId,
    'discount.manage',
    async (scope, member) => {
      for (const id of form.productIds) {
        if (!(await catalogue.findProductById(scope, toProductId(id)))) {
          throw new ActionFailure(
            'One of the selected products no longer exists. Reload and try again.',
          )
        }
      }
      try {
        const created = await discounts.createDiscount(scope, {
          code: form.code,
          discountType: form.type,
          discountValue: scaled,
          currency:
            form.type === 'fixed_amount' ? toCurrency(member.access.workspace.currency) : null,
          maxUses: form.maxUses,
          startsAt,
          expiresAt,
          minOrderAmount: minOrder,
          productIds: form.productIds.map((id) => toProductId(id)),
          isActive: true,
        })
        await auditLog.writeAuditLog(scope, auditOptions, {
          actorType: 'user',
          actorId: member.actorId as never,
          action: 'discount.created',
          targetType: 'discount',
          targetId: created.id,
          metadata: { code: created.code, type: form.type, value: scaled.toString() },
        })
        return { id: created.id, code: created.code }
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ActionFailure(
            `You already have a code called ${form.code}. Codes stay reserved after you pause them.`,
          )
        }
        throw error
      }
    },
  )
}

export async function setDiscountActiveAction(
  rawWorkspaceId: string,
  rawDiscountId: string,
  active: boolean,
): Promise<ActionResult<{ readonly isActive: boolean }>> {
  if (!z.string().uuid().safeParse(rawDiscountId).success) {
    return { ok: false, error: 'That discount does not exist.' }
  }
  return memberAction(
    'discount.toggle',
    rawWorkspaceId,
    'discount.manage',
    async (scope, member) => {
      const id = toDiscountId(rawDiscountId)
      if (!(await discounts.findDiscountById(scope, id)))
        throw new ActionFailure('That discount does not exist.')
      const updated = await discounts.setDiscountActive(scope, id, active)
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: member.actorId as never,
        action: active ? 'discount.resumed' : 'discount.paused',
        targetType: 'discount',
        targetId: updated.id,
        metadata: { code: updated.code },
      })
      return { isActive: updated.isActive }
    },
  )
}
