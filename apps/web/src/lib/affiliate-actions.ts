/**
 * Server actions for the affiliate programme.
 *
 * Creators turn the programme on, set the commission, invite affiliates, and
 * pause them. Affiliates save where they want to be paid. Commissions are
 * accrued by the order flow and settled to affiliates by the operator, the
 * same way creator payouts are.
 */
'use server'

import { affiliates, auditLog } from '@creatorhub/db'
import { z } from 'zod'

import { getEmailService } from './email'
import { auditOptions } from './env'
import { affiliatePortalUrl, referralUrl, withAffiliateOwner } from './affiliate-portal'
import { parsePriceToMinor } from './format'
import { ActionFailure, isUniqueViolation, memberAction, type ActionResult } from './member-action'

function percentToBps(value: string): number | null {
  const scaled = parsePriceToMinor(value)
  if (scaled === null || scaled < 0n || scaled > 10000n) return null
  return Number(scaled)
}

const programSchema = z.object({
  isActive: z.boolean(),
  commissionPercent: z.string().trim(),
  cookieWindowDays: z.number().int().min(1).max(365),
})

export async function saveAffiliateProgramAction(
  rawWorkspaceId: string,
  input: z.input<typeof programSchema>,
): Promise<ActionResult<{ readonly isActive: boolean }>> {
  const parsed = programSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: 'The cookie window must be between 1 and 365 days.' }
  const bps = percentToBps(parsed.data.commissionPercent)
  if (bps === null || bps === 0)
    return { ok: false, error: 'Set a commission between 0.01% and 100%.' }

  return memberAction(
    'affiliate.program',
    rawWorkspaceId,
    'affiliate.manage',
    async (scope, member) => {
      const updated = await affiliates.upsertAffiliateProgram(scope, {
        isActive: parsed.data.isActive,
        defaultCommissionBps: bps,
        cookieWindowDays: parsed.data.cookieWindowDays,
      })
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: member.actorId as never,
        action: 'affiliate_program.updated',
        targetType: 'affiliate_program',
        targetId: updated.id,
        metadata: {
          isActive: updated.isActive,
          defaultCommissionBps: bps,
          cookieWindowDays: parsed.data.cookieWindowDays,
        },
      })
      return { isActive: updated.isActive }
    },
  )
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  name: z.string().trim().max(120),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{3,32}$/, 'Codes use 3 to 32 letters, numbers, hyphens, or underscores.'),
  commissionPercent: z.string().trim(),
})

export async function inviteAffiliateAction(
  rawWorkspaceId: string,
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult<{ readonly code: string; readonly referralUrl: string }>> {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Some fields are not valid.' }
  const form = parsed.data
  const customBps = form.commissionPercent ? percentToBps(form.commissionPercent) : null
  if (form.commissionPercent && (customBps === null || customBps === 0)) {
    return {
      ok: false,
      error: 'Set a commission between 0.01% and 100%, or leave it empty for your default.',
    }
  }

  const result = await memberAction(
    'affiliate.invite',
    rawWorkspaceId,
    'affiliate.manage',
    async (scope, member) => {
      const subdomain = member.access.storefront?.subdomain
      if (!subdomain) throw new ActionFailure('Set up your store before inviting affiliates.')
      const program = await affiliates.getAffiliateProgram(scope)
      if (await affiliates.findAffiliateByEmail(scope, form.email)) {
        throw new ActionFailure(`${form.email} is already one of your affiliates.`)
      }
      if (await affiliates.findAffiliateLinkByCode(scope, form.code)) {
        throw new ActionFailure(`The code ${form.code} is taken. Pick another.`)
      }
      try {
        const affiliate = await affiliates.createAffiliate(scope, {
          email: form.email,
          name: form.name || null,
          status: 'approved',
          customCommissionBps: customBps,
        })
        await affiliates.createAffiliateLink(scope, { affiliateId: affiliate.id, code: form.code })
        await auditLog.writeAuditLog(scope, auditOptions, {
          actorType: 'user',
          actorId: member.actorId as never,
          action: 'affiliate.invited',
          targetType: 'affiliate',
          targetId: affiliate.id,
          metadata: { email: form.email, code: form.code, customCommissionBps: customBps },
        })
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ActionFailure('That email or code is already in use.')
        throw error
      }
      return {
        subdomain,
        storeName: member.access.workspace.name,
        bps: customBps ?? program?.defaultCommissionBps ?? 2000,
      }
    },
  )
  if (!result.ok) return result

  // After commit: the email is a side effect, never part of the transaction.
  const { subdomain, storeName, bps } = result.data
  const link = referralUrl(subdomain, form.code)
  await getEmailService()
    .sendAffiliateInvite({
      to: form.email,
      storeName,
      commissionPercent: `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`,
      referralUrl: link,
      portalUrl: affiliatePortalUrl(subdomain, form.code),
    })
    .catch((error: unknown) => {
      console.error(
        '[affiliate] invite email failed',
        error instanceof Error ? error.message : error,
      )
    })
  return { ok: true, data: { code: form.code, referralUrl: link } }
}

export async function setAffiliateStatusAction(
  rawWorkspaceId: string,
  rawAffiliateId: string,
  status: 'approved' | 'suspended',
): Promise<ActionResult<{ readonly status: string }>> {
  if (
    !z.string().uuid().safeParse(rawAffiliateId).success ||
    !['approved', 'suspended'].includes(status)
  ) {
    return { ok: false, error: 'That affiliate does not exist.' }
  }
  return memberAction(
    'affiliate.status',
    rawWorkspaceId,
    'affiliate.manage',
    async (scope, member) => {
      const updated = await affiliates.updateAffiliateStatus(scope, rawAffiliateId, status)
      if (!updated) throw new ActionFailure('That affiliate does not exist.')
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: member.actorId as never,
        action: status === 'approved' ? 'affiliate.resumed' : 'affiliate.paused',
        targetType: 'affiliate',
        targetId: rawAffiliateId,
        metadata: {},
      })
      return { status }
    },
  )
}

const payoutSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('upi'),
    upiId: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,64}$/, 'Enter a UPI ID like name@okhdfcbank.'),
  }),
  z.object({
    method: z.literal('bank'),
    accountName: z.string().trim().min(2, 'Enter the name on the account.').max(120),
    accountNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{9,18}$/, 'Account numbers are 9 to 18 digits.'),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter an 11-character IFSC like HDFC0001234.'),
  }),
])

/** The affiliate's own action: where to send their commissions. */
export async function saveAffiliatePayoutAccountAction(
  subdomain: string,
  code: string,
  input: z.input<typeof payoutSchema>,
): Promise<ActionResult<{ readonly saved: true }>> {
  const parsed = payoutSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details.' }
  try {
    const result = await withAffiliateOwner(subdomain, code, async (scope, affiliate) => {
      await affiliates.setAffiliatePayoutAccount(scope, affiliate.id, {
        ...parsed.data,
        updatedAt: new Date().toISOString(),
      })
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'affiliate',
        action: 'affiliate.payout_account_updated',
        targetType: 'affiliate',
        targetId: affiliate.id,
        metadata: { method: parsed.data.method },
      })
    })
    if (!result.ok)
      return { ok: false, error: 'Sign in with the email your invitation was sent to.' }
    return { ok: true, data: { saved: true } }
  } catch (error) {
    console.error('[affiliate] payout account not saved', error)
    return { ok: false, error: 'Something went wrong on our side. Try again in a moment.' }
  }
}
