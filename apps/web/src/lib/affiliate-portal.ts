/**
 * The affiliate's side of the programme: their dashboard, and counting the
 * clicks on their links.
 *
 * An affiliate is not a workspace member, so the dashboard is reached through
 * the store and the referral code (`/affiliate/<store>/<code>`), and shown only
 * to the account that owns the affiliate record: the one already linked to it,
 * or, the first time, a signed-in account whose verified email matches the
 * address the creator invited. A referral code alone is public (it is in every
 * shared link), so it never unlocks earnings by itself.
 */
import { createHash, randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import {
  affiliateId as toAffiliateId,
  requestId,
  workspaceContext,
  type WorkspaceContext,
} from '@creatorhub/contracts'
import {
  affiliates,
  commissions,
  storefronts,
  workspaces,
  type RepositoryScope,
} from '@creatorhub/db'

import { getDatabase } from './db'
import { appUrl, auditSalt, storefrontUrl } from './env'
import { isValidReferralCode } from './referral'
import { getServerSession, type ServerSession } from './server-session'

export const COMMISSION_HOLD_DAYS = 30

export function referralUrl(subdomain: string, code: string): string {
  return `${storefrontUrl(subdomain)}?ref=${encodeURIComponent(code)}`
}

export function affiliatePortalUrl(subdomain: string, code: string): string {
  return `${appUrl()}/affiliate/${encodeURIComponent(subdomain)}/${encodeURIComponent(code)}`
}

type OpenedLink = {
  readonly context: WorkspaceContext
  readonly subdomain: string
}

async function openStore(subdomain: string): Promise<OpenedLink | null> {
  const clean = subdomain.trim().toLowerCase()
  if (!/^[a-z0-9-]{1,63}$/.test(clean)) return null
  const store = await getDatabase().resolveStorefrontByHostname(clean)
  if (!store || store.status === 'suspended') return null
  return {
    subdomain: store.subdomain,
    context: workspaceContext({
      workspaceId: store.workspaceId,
      requestId: requestId(`req-aff-${randomUUID().slice(0, 8)}`),
    }),
  }
}

function owns(
  session: ServerSession,
  affiliate: { readonly userId: string | null; readonly email: string },
): 'yes' | 'claim' | 'unverified' | 'no' {
  if (affiliate.userId) return affiliate.userId === session.userId ? 'yes' : 'no'
  if (session.user.email.toLowerCase() !== affiliate.email.toLowerCase()) return 'no'
  return session.user.emailVerified ? 'claim' : 'unverified'
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

export type PayoutAccount =
  | { readonly method: 'upi'; readonly upiId: string }
  | {
      readonly method: 'bank'
      readonly accountName: string
      readonly accountNumber: string
      readonly ifsc: string
    }

export type AffiliatePortalData = {
  readonly store: { readonly title: string; readonly url: string; readonly subdomain: string }
  readonly affiliate: {
    readonly name: string | null
    readonly email: string
    readonly status: string
  }
  readonly code: string
  readonly referralUrl: string
  readonly commissionBps: number
  readonly cookieWindowDays: number
  readonly programActive: boolean
  readonly currency: string
  readonly clicks: number
  readonly conversions: number
  readonly balances: {
    readonly held: string
    readonly payable: string
    readonly paid: string
    readonly reversed: string
  }
  readonly payoutAccount: PayoutAccount | null
  readonly commissions: readonly {
    readonly id: string
    readonly saleAmount: string
    readonly amount: string
    readonly status: string
    readonly heldUntil: string
    readonly createdAt: string
  }[]
}

export type AffiliatePortalState =
  | { readonly state: 'not_found' }
  | { readonly state: 'signed_out'; readonly storeTitle: string; readonly maskedEmail: string }
  | { readonly state: 'unverified'; readonly storeTitle: string; readonly email: string }
  | {
      readonly state: 'wrong_account'
      readonly storeTitle: string
      readonly maskedEmail: string
      readonly signedInAs: string
    }
  | { readonly state: 'ok'; readonly data: AffiliatePortalData }

function parsePayoutAccount(value: unknown): PayoutAccount | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v['method'] === 'upi' && typeof v['upiId'] === 'string')
    return { method: 'upi', upiId: v['upiId'] }
  if (
    v['method'] === 'bank' &&
    typeof v['accountName'] === 'string' &&
    typeof v['accountNumber'] === 'string' &&
    typeof v['ifsc'] === 'string'
  ) {
    return {
      method: 'bank',
      accountName: v['accountName'],
      accountNumber: v['accountNumber'],
      ifsc: v['ifsc'],
    }
  }
  return null
}

async function readPortal(
  scope: RepositoryScope,
  subdomain: string,
  affiliateId: string,
  code: string,
): Promise<AffiliatePortalData> {
  // Holds end on their own schedule; settle any that have before reading.
  await commissions.releaseHeldCommissions(scope, new Date())

  const [affiliate, link, program, ws, store, breakdown, rows] = await Promise.all([
    affiliates.findAffiliateById(scope, affiliateId),
    affiliates.findAffiliateLinkByCode(scope, code),
    affiliates.getAffiliateProgram(scope),
    workspaces.findCurrentWorkspace(scope),
    storefronts.findStorefrontByWorkspaceId(scope),
    commissions.getAffiliateLedgerBreakdown(scope, toAffiliateId(affiliateId)),
    commissions.listCommissionsForAffiliate(scope, toAffiliateId(affiliateId)),
  ])
  if (!affiliate || !link) throw new Error('affiliate vanished mid-read')

  return {
    store: { title: store?.title ?? ws?.name ?? 'Store', url: storefrontUrl(subdomain), subdomain },
    affiliate: { name: affiliate.name, email: affiliate.email, status: affiliate.status },
    code: link.code,
    referralUrl: referralUrl(subdomain, link.code),
    commissionBps: affiliate.customCommissionBps ?? program?.defaultCommissionBps ?? 2000,
    cookieWindowDays: program?.cookieWindowDays ?? 30,
    programActive: program?.isActive ?? false,
    currency: ws?.defaultCurrency ?? 'INR',
    clicks: link.clicksCount,
    conversions: link.conversionsCount,
    balances: {
      held: breakdown.heldMinor.toString(),
      payable: breakdown.vestedMinor.toString(),
      paid: breakdown.paidMinor.toString(),
      reversed: breakdown.clawedBackMinor.toString(),
    },
    payoutAccount: parsePayoutAccount(affiliate.payoutAccount),
    commissions: rows.slice(0, 100).map((c) => ({
      id: c.id,
      saleAmount: c.grossSaleAmount.toString(),
      amount: c.netAmount.toString(),
      status: c.status,
      heldUntil: c.heldUntil.toISOString(),
      createdAt: c.createdAt.toISOString(),
    })),
  }
}

/** Open the affiliate record for the signed-in owner, or say why not. */
export async function withAffiliateOwner<T>(
  subdomain: string,
  code: string,
  work: (
    scope: RepositoryScope,
    affiliate: { readonly id: string },
    opened: OpenedLink,
  ) => Promise<T>,
): Promise<
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly state: Exclude<AffiliatePortalState, { state: 'ok' }> }
> {
  if (!isValidReferralCode(code)) return { ok: false, state: { state: 'not_found' } }
  const opened = await openStore(subdomain)
  if (!opened) return { ok: false, state: { state: 'not_found' } }
  const session = await getServerSession()

  type Outcome =
    { ok: true; value: T } | { ok: false; state: Exclude<AffiliatePortalState, { state: 'ok' }> }
  return getDatabase().withWorkspace(opened.context, async (tx): Promise<Outcome> => {
    const scope = { tx, context: opened.context }
    const link = await affiliates.findAffiliateLinkByCode(scope, code)
    const affiliate = link ? await affiliates.findAffiliateById(scope, link.affiliateId) : null
    if (!link || !affiliate) return { ok: false, state: { state: 'not_found' } }
    const store = await storefronts.findStorefrontByWorkspaceId(scope)
    const storeTitle = store?.title ?? 'this store'

    if (!session)
      return {
        ok: false,
        state: { state: 'signed_out', storeTitle, maskedEmail: maskEmail(affiliate.email) },
      }
    const verdict = owns(session, affiliate)
    if (verdict === 'no') {
      return {
        ok: false,
        state: {
          state: 'wrong_account',
          storeTitle,
          maskedEmail: maskEmail(affiliate.email),
          signedInAs: session.user.email,
        },
      }
    }
    if (verdict === 'unverified') {
      return { ok: false, state: { state: 'unverified', storeTitle, email: session.user.email } }
    }
    if (verdict === 'claim') await affiliates.linkAffiliateUser(scope, affiliate.id, session.userId)
    return { ok: true, value: await work(scope, { id: affiliate.id }, opened) }
  })
}

export async function loadAffiliatePortal(
  subdomain: string,
  code: string,
): Promise<AffiliatePortalState> {
  const result = await withAffiliateOwner(subdomain, code, (scope, affiliate, opened) =>
    readPortal(scope, opened.subdomain, affiliate.id, code),
  )
  return result.ok ? { state: 'ok', data: result.value } : result.state
}

const BOT_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|preview|curl|wget|python|headless/i

/**
 * Count a visit that arrived through a referral link. Called while the store
 * page renders.
 */
export async function recordReferralClick(host: string, code: string): Promise<void> {
  if (!isValidReferralCode(code)) return

  const store = await getDatabase().resolveStorefrontByHostname(host)
  if (store?.status !== 'published') return

  const h = await headers()
  const userAgent = h.get('user-agent') ?? ''
  const forwarded = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
  const ip = forwarded?.length ? forwarded : (h.get('x-real-ip') ?? 'unknown')
  const day = new Date().toISOString().slice(0, 10)
  const salt = auditSalt()
  const ipHash = createHash('sha256').update(`${ip}:${salt}`).digest('hex')
  const visitorToken = createHash('sha256')
    .update(`${ip}|${userAgent}|${day}|${salt}`)
    .digest('hex')
    .slice(0, 32)

  const context = workspaceContext({
    workspaceId: store.workspaceId,
    requestId: requestId(`req-click-${randomUUID().slice(0, 8)}`),
  })
  try {
    await getDatabase().withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const link = await affiliates.findAffiliateLinkByCode(scope, code)
      if (!link) return
      // One click per visitor per day: a reload or a second page is not a new referral.
      if (await affiliates.hasClickFromVisitor(scope, link.id, visitorToken)) return
      await affiliates.recordAffiliateClick(scope, {
        affiliateLinkId: link.id,
        affiliateId: link.affiliateId,
        visitorToken,
        ipHash,
        userAgent: userAgent.slice(0, 500),
        referer: h.get('referer')?.slice(0, 500) ?? undefined,
        isBot: userAgent.length === 0 || BOT_PATTERN.test(userAgent),
      })
    })
  } catch (error) {
    // A click count is never worth failing a store page over.
    console.error('[referral] click not recorded', error instanceof Error ? error.message : error)
  }
}
