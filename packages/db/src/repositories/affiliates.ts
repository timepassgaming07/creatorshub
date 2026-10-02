/**
 * Affiliate Programme & Attribution Repository (Slice 8 §8.1-§8.5).
 *
 * Responsibilities:
 * - Program settings CRUD and summary metrics aggregation.
 * - Promoter (affiliate) management, status approvals/suspensions, earnings accrual.
 * - Referral link creation, code lookup, click recording with bot detection.
 * - Order attribution records with immutable rejection/approval decisions.
 * - Strict multi-tenant scoping on workspace_id.
 */
import { count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'

import { insertValues, scoped, type RepositoryScope } from '../repository.js'
import {
  affiliateClicks,
  affiliateLinks,
  affiliatePrograms,
  affiliates,
  attributions,
  type AffiliateClickRow,
  type AffiliateLinkRow,
  type AffiliateProgramRow,
  type AffiliateRow,
  type AttributionRow,
} from '../schema/affiliates.js'

/** A write with `.returning()` yields one row; an empty result is a bug, not a state. */
function returned<T>(row: T | undefined): T {
  if (!row) throw new Error('The database write returned no row.')
  return row
}

export type UpsertAffiliateProgramInput = {
  readonly isActive?: boolean | undefined
  readonly defaultCommissionBps?: number | undefined
  readonly cookieWindowDays?: number | undefined
  readonly allowSelfReferral?: boolean | undefined
  readonly autoApproveAffiliates?: boolean | undefined
}

export type CreateAffiliateInput = {
  readonly userId?: string | null | undefined
  readonly email: string
  readonly name?: string | null | undefined
  readonly customCommissionBps?: number | null | undefined
  readonly payoutAccount?: Record<string, unknown> | undefined
  readonly status?: string | undefined
}

export type AffiliateFilter = {
  readonly status?: string | undefined
  readonly query?: string | undefined
  readonly limit?: number | undefined
  readonly offset?: number | undefined
}

export type CreateAffiliateLinkInput = {
  readonly affiliateId: string
  readonly code: string
  readonly destinationUrl?: string | null | undefined
}

export type RecordAffiliateClickInput = {
  readonly affiliateLinkId: string
  readonly affiliateId: string
  readonly visitorToken: string
  readonly ipHash: string
  readonly userAgent?: string | null | undefined
  readonly referer?: string | null | undefined
  readonly isBot?: boolean | undefined
}

export type CreateAttributionInput = {
  readonly orderId: string
  readonly affiliateId: string
  readonly affiliateLinkId: string
  readonly affiliateClickId?: string | null | undefined
  readonly commissionBps: number
  readonly commissionAmount: bigint
  readonly status: string
  readonly rejectionReason?: string | null | undefined
}

/**
 * Retrieves workspace affiliate program settings.
 */
export async function getAffiliateProgram(
  scope: RepositoryScope,
): Promise<AffiliateProgramRow | null> {
  const [row] = await scope.tx
    .select()
    .from(affiliatePrograms)
    .where(scoped(scope, affiliatePrograms))
    .limit(1)

  return row ?? null
}

/**
 * Creates or updates workspace affiliate program settings.
 */
export async function upsertAffiliateProgram(
  scope: RepositoryScope,
  input: UpsertAffiliateProgramInput,
): Promise<AffiliateProgramRow> {
  const existing = await getAffiliateProgram(scope)

  if (existing) {
    const [updated] = await scope.tx
      .update(affiliatePrograms)
      .set({
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.defaultCommissionBps !== undefined && {
          defaultCommissionBps: input.defaultCommissionBps,
        }),
        ...(input.cookieWindowDays !== undefined && {
          cookieWindowDays: input.cookieWindowDays,
        }),
        ...(input.allowSelfReferral !== undefined && {
          allowSelfReferral: input.allowSelfReferral,
        }),
        ...(input.autoApproveAffiliates !== undefined && {
          autoApproveAffiliates: input.autoApproveAffiliates,
        }),
        updatedAt: new Date(),
      })
      .where(scoped(scope, affiliatePrograms, eq(affiliatePrograms.id, existing.id)))
      .returning()

    return returned(updated)
  }

  const [created] = await scope.tx
    .insert(affiliatePrograms)
    .values(
      insertValues(scope, {
        isActive: input.isActive ?? false,
        defaultCommissionBps: input.defaultCommissionBps ?? 2000,
        cookieWindowDays: input.cookieWindowDays ?? 30,
        allowSelfReferral: input.allowSelfReferral ?? false,
        autoApproveAffiliates: input.autoApproveAffiliates ?? false,
      }),
    )
    .returning()

  return returned(created)
}

/**
 * Creates a new promoter (affiliate) record.
 */
export async function createAffiliate(
  scope: RepositoryScope,
  input: CreateAffiliateInput,
): Promise<AffiliateRow> {
  const [created] = await scope.tx
    .insert(affiliates)
    .values(
      insertValues(scope, {
        userId: input.userId ?? null,
        email: input.email.trim().toLowerCase(),
        name: input.name ?? null,
        status: input.status ?? 'pending',
        customCommissionBps: input.customCommissionBps ?? null,
        payoutAccount: input.payoutAccount ?? {},
      }),
    )
    .returning()

  return returned(created)
}

/**
 * Finds an affiliate by id.
 */
export async function findAffiliateById(
  scope: RepositoryScope,
  id: string,
): Promise<AffiliateRow | null> {
  const [row] = await scope.tx
    .select()
    .from(affiliates)
    .where(scoped(scope, affiliates, eq(affiliates.id, id)))
    .limit(1)

  return row ?? null
}

/**
 * Finds an affiliate by email.
 */
export async function findAffiliateByEmail(
  scope: RepositoryScope,
  email: string,
): Promise<AffiliateRow | null> {
  const [row] = await scope.tx
    .select()
    .from(affiliates)
    .where(scoped(scope, affiliates, eq(affiliates.email, email.trim().toLowerCase())))
    .limit(1)

  return row ?? null
}

/**
 * Finds an affiliate by user id.
 */
export async function findAffiliateByUserId(
  scope: RepositoryScope,
  userId: string,
): Promise<AffiliateRow | null> {
  const [row] = await scope.tx
    .select()
    .from(affiliates)
    .where(scoped(scope, affiliates, eq(affiliates.userId, userId)))
    .limit(1)

  return row ?? null
}

/**
 * Updates affiliate approval or suspension status.
 */
export async function updateAffiliateStatus(
  scope: RepositoryScope,
  id: string,
  status: string,
): Promise<AffiliateRow | null> {
  const [updated] = await scope.tx
    .update(affiliates)
    .set({ status, updatedAt: new Date() })
    .where(scoped(scope, affiliates, eq(affiliates.id, id)))
    .returning()

  return updated ?? null
}

/**
 * Lists affiliates with search, status filter, and pagination.
 */
export async function listAffiliates(
  scope: RepositoryScope,
  filter: AffiliateFilter = {},
): Promise<AffiliateRow[]> {
  const conditions = []

  if (filter.status) {
    conditions.push(eq(affiliates.status, filter.status))
  }

  if (filter.query) {
    const q = `%${filter.query.trim()}%`
    conditions.push(or(ilike(affiliates.email, q), ilike(affiliates.name, q)))
  }

  return scope.tx
    .select()
    .from(affiliates)
    .where(scoped(scope, affiliates, ...conditions))
    .orderBy(desc(affiliates.createdAt))
    .limit(filter.limit ?? 50)
    .offset(filter.offset ?? 0)
}

/**
 * Counts affiliates matching filter.
 */
export async function countAffiliates(
  scope: RepositoryScope,
  filter: AffiliateFilter = {},
): Promise<number> {
  const conditions = []

  if (filter.status) {
    conditions.push(eq(affiliates.status, filter.status))
  }

  if (filter.query) {
    const q = `%${filter.query.trim()}%`
    conditions.push(or(ilike(affiliates.email, q), ilike(affiliates.name, q)))
  }

  const [res] = await scope.tx
    .select({ count: count() })
    .from(affiliates)
    .where(scoped(scope, affiliates, ...conditions))

  return res?.count ?? 0
}

/**
 * Aggregates high-level metrics for the affiliate program.
 */
export async function getAffiliateProgramSummary(scope: RepositoryScope): Promise<{
  readonly totalAffiliates: number
  readonly activeAffiliatesCount: number
  readonly totalReferredRevenueMinor: bigint
  readonly totalCommissionAccruedMinor: bigint
  readonly totalConversionsCount: number
}> {
  const [affiliateStats] = await scope.tx
    .select({
      total: count(),
      active: sql<number>`count(case when status = 'approved' then 1 end)::int`,
      conversions: sql<number>`coalesce(sum(total_conversions), 0)::int`,
      earnings: sql<bigint>`coalesce(sum(total_earnings), 0)::bigint`,
    })
    .from(affiliates)
    .where(scoped(scope, affiliates))

  const [attributionStats] = await scope.tx
    .select({
      totalCommission: sql<bigint>`coalesce(sum(commission_amount), 0)::bigint`,
    })
    .from(attributions)
    .where(scoped(scope, attributions, eq(attributions.status, 'attributed')))

  return {
    totalAffiliates: affiliateStats?.total ?? 0,
    activeAffiliatesCount: affiliateStats?.active ?? 0,
    totalReferredRevenueMinor: 0n, // Can be joined with orders or derived
    totalCommissionAccruedMinor: attributionStats?.totalCommission ?? 0n,
    totalConversionsCount: affiliateStats?.conversions ?? 0,
  }
}

/**
 * Creates an affiliate referral link.
 */
export async function createAffiliateLink(
  scope: RepositoryScope,
  input: CreateAffiliateLinkInput,
): Promise<AffiliateLinkRow> {
  const [created] = await scope.tx
    .insert(affiliateLinks)
    .values(
      insertValues(scope, {
        affiliateId: input.affiliateId,
        code: input.code.trim().toLowerCase(),
        destinationUrl: input.destinationUrl ?? null,
      }),
    )
    .returning()

  return returned(created)
}

/**
 * Finds an affiliate link by referral code.
 */
export async function findAffiliateLinkByCode(
  scope: RepositoryScope,
  code: string,
): Promise<AffiliateLinkRow | null> {
  const [row] = await scope.tx
    .select()
    .from(affiliateLinks)
    .where(scoped(scope, affiliateLinks, eq(affiliateLinks.code, code.trim().toLowerCase())))
    .limit(1)

  return row ?? null
}

/**
 * Lists affiliate links for a workspace or promoter.
 */
export async function listAffiliateLinks(
  scope: RepositoryScope,
  affiliateId?: string,
): Promise<AffiliateLinkRow[]> {
  const conditions = []
  if (affiliateId) {
    conditions.push(eq(affiliateLinks.affiliateId, affiliateId))
  }

  return scope.tx
    .select()
    .from(affiliateLinks)
    .where(scoped(scope, affiliateLinks, ...conditions))
    .orderBy(desc(affiliateLinks.createdAt))
}

/**
 * Records an affiliate click event and increments link click counter atomically.
 */
export async function recordAffiliateClick(
  scope: RepositoryScope,
  input: RecordAffiliateClickInput,
): Promise<AffiliateClickRow> {
  const [click] = await scope.tx
    .insert(affiliateClicks)
    .values(
      insertValues(scope, {
        affiliateLinkId: input.affiliateLinkId,
        affiliateId: input.affiliateId,
        visitorToken: input.visitorToken,
        ipHash: input.ipHash,
        userAgent: input.userAgent ?? null,
        referer: input.referer ?? null,
        isBot: input.isBot ?? false,
      }),
    )
    .returning()

  // Increment clicks counter on affiliate link
  if (!input.isBot) {
    await scope.tx
      .update(affiliateLinks)
      .set({
        clicksCount: sql`${affiliateLinks.clicksCount} + 1`,
        updatedAt: new Date(),
      })
      .where(scoped(scope, affiliateLinks, eq(affiliateLinks.id, input.affiliateLinkId)))
  }

  return returned(click)
}

/**
 * Creates an immutable order attribution record and updates affiliate totals if approved.
 */
export async function createAttribution(
  scope: RepositoryScope,
  input: CreateAttributionInput,
): Promise<AttributionRow> {
  const [attribution] = await scope.tx
    .insert(attributions)
    .values(
      insertValues(scope, {
        orderId: input.orderId,
        affiliateId: input.affiliateId,
        affiliateLinkId: input.affiliateLinkId,
        affiliateClickId: input.affiliateClickId ?? null,
        commissionBps: input.commissionBps,
        commissionAmount: input.commissionAmount,
        status: input.status,
        rejectionReason: input.rejectionReason ?? null,
      }),
    )
    .returning()

  if (input.status === 'attributed' && input.commissionAmount > 0n) {
    // Update affiliate total earnings and conversions
    await scope.tx
      .update(affiliates)
      .set({
        totalEarnings: sql`${affiliates.totalEarnings} + ${input.commissionAmount}`,
        totalConversions: sql`${affiliates.totalConversions} + 1`,
        updatedAt: new Date(),
      })
      .where(scoped(scope, affiliates, eq(affiliates.id, input.affiliateId)))

    // Increment link conversions
    await scope.tx
      .update(affiliateLinks)
      .set({
        conversionsCount: sql`${affiliateLinks.conversionsCount} + 1`,
        updatedAt: new Date(),
      })
      .where(scoped(scope, affiliateLinks, eq(affiliateLinks.id, input.affiliateLinkId)))
  }

  return returned(attribution)
}

/**
 * Finds attribution by order id.
 */
export async function findAttributionByOrderId(
  scope: RepositoryScope,
  orderId: string,
): Promise<AttributionRow | null> {
  const [row] = await scope.tx
    .select()
    .from(attributions)
    .where(scoped(scope, attributions, eq(attributions.orderId, orderId)))
    .limit(1)

  return row ?? null
}

/**
 * Lists attributions for an affiliate.
 */
export async function listAttributionsForAffiliate(
  scope: RepositoryScope,
  affiliateId: string,
): Promise<AttributionRow[]> {
  return scope.tx
    .select()
    .from(attributions)
    .where(scoped(scope, attributions, eq(attributions.affiliateId, affiliateId)))
    .orderBy(desc(attributions.attributedAt))
}

/**
 * Connect an affiliate record to the account that signed in with its email.
 * Only sets a missing link, so an affiliate can never be moved to another user.
 */
export async function linkAffiliateUser(
  scope: RepositoryScope,
  affiliateId: string,
  userId: string,
): Promise<void> {
  await scope.tx
    .update(affiliates)
    .set({ userId, updatedAt: new Date() })
    .where(scoped(scope, affiliates, eq(affiliates.id, affiliateId), isNull(affiliates.userId)))
}

/** Where the affiliate wants to be paid. Read by the operator who settles payouts. */
export async function setAffiliatePayoutAccount(
  scope: RepositoryScope,
  affiliateId: string,
  payoutAccount: Record<string, unknown>,
): Promise<void> {
  await scope.tx
    .update(affiliates)
    .set({ payoutAccount, updatedAt: new Date() })
    .where(scoped(scope, affiliates, eq(affiliates.id, affiliateId)))
}

/** Whether this visitor already has a click on this link (the token is per day). */
export async function hasClickFromVisitor(
  scope: RepositoryScope,
  affiliateLinkId: string,
  visitorToken: string,
): Promise<boolean> {
  const rows = await scope.tx
    .select({ id: affiliateClicks.id })
    .from(affiliateClicks)
    .where(
      scoped(
        scope,
        affiliateClicks,
        eq(affiliateClicks.affiliateLinkId, affiliateLinkId),
        eq(affiliateClicks.visitorToken, visitorToken),
      ),
    )
    .limit(1)
  return rows.length > 0
}
