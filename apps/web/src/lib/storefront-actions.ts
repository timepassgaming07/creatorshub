/**
 * Server actions behind the storefront editor: save the profile and theme,
 * publish or take the store down, and connect a custom domain.
 *
 * Status and the custom domain each have their own action rather than riding
 * along with a save, so a creator cannot lift a platform suspension or claim
 * a domain without the verification flow.
 */
'use server'

import {
  buildDomainChallenge,
  customDomainSchema,
  productId,
  type CustomDomainChallenge,
  type RecordStorefrontEventInput,
  recordStorefrontEventInputSchema,
  requestId,
  storefrontId,
  storefrontThemeSchema,
  assetId as toAssetId,
  workspaceContext,
} from '@creatorhub/contracts'
import { auditLog, catalogue, storefronts, type RepositoryScope } from '@creatorhub/db'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { getDatabase } from './db'
import { generateDomainVerificationToken, verifyCustomDomainDns } from './domain-verification'
import { auditOptions, customDomainTarget, platformRootDomain } from './env'
import {
  ActionFailure,
  authoriseMember,
  inWorkspace,
  isUniqueViolation,
  memberAction,
  runAction,
  type ActionResult,
} from './member-action'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

const saveStorefrontSchema = z.object({
  title: z.string().trim().min(1, 'Give your store a name.').max(100),
  tagline: z.string().trim().max(200).nullable(),
  theme: storefrontThemeSchema,
})

export type SaveStorefrontInput = z.input<typeof saveStorefrontSchema>

async function requireStore(scope: RepositoryScope) {
  const store = await storefronts.findStorefrontByWorkspaceId(scope)
  if (!store) throw new ActionFailure('This workspace has no store yet. Reload the page.')
  return store
}

async function assertStoreImage(scope: RepositoryScope, id: string | undefined, label: string) {
  if (!id) return
  const asset = await catalogue.findAssetById(scope, toAssetId(id))
  if (!asset || !IMAGE_TYPES.has(asset.mimeType)) {
    throw new ActionFailure(`The ${label} must be a PNG, JPEG, WebP, GIF, or AVIF image.`)
  }
  if (asset.scanStatus !== 'clean') {
    throw new ActionFailure(`The ${label} is still being checked. Try saving again in a moment.`)
  }
}

export async function saveStorefrontAction(
  rawWorkspaceId: string,
  input: SaveStorefrontInput,
): Promise<ActionResult<{ readonly savedAt: string }>> {
  const parsed = saveStorefrontSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.join('.') ?? ''
    const message = where.includes('Links')
      ? 'One of your links is not a valid web address. Links must start with https://.'
      : (issue?.message ?? 'Some fields are not valid.')
    return { ok: false, error: message }
  }
  const { title, tagline, theme } = parsed.data

  return memberAction(
    'storefront.save',
    rawWorkspaceId,
    'storefront.manage',
    async (scope, member) => {
      const store = await requireStore(scope)
      await assertStoreImage(scope, theme.logoAssetId, 'logo')
      await assertStoreImage(scope, theme.bannerAssetId, 'banner')

      await storefronts.updateStorefront(scope, storefrontId(store.id), {
        title,
        tagline: tagline && tagline.length > 0 ? tagline : null,
        themeConfig: theme,
      })
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: member.actorId as never,
        action: 'storefront.updated',
        targetType: 'storefront',
        targetId: store.id,
        metadata: { title, layout: theme.layoutPreset },
      })
      return { savedAt: new Date().toISOString() }
    },
  )
}

export async function setStorefrontPublishedAction(
  rawWorkspaceId: string,
  published: boolean,
): Promise<ActionResult<{ readonly status: 'draft' | 'published' }>> {
  return memberAction(
    'storefront.publish',
    rawWorkspaceId,
    'storefront.publish',
    async (scope, member) => {
      const store = await requireStore(scope)
      if (store.status === 'suspended') {
        throw new ActionFailure(
          'This store is suspended by CreatorHub. Contact support to have it reviewed.',
        )
      }
      const status = published ? 'published' : 'draft'
      if (store.status !== status) {
        await storefronts.updateStorefront(scope, storefrontId(store.id), { status })
        await auditLog.writeAuditLog(scope, auditOptions, {
          actorType: 'user',
          actorId: member.actorId as never,
          action: published ? 'storefront.published' : 'storefront.unpublished',
          targetType: 'storefront',
          targetId: store.id,
          metadata: {},
        })
      }
      return { status }
    },
  )
}

export type CustomDomainState = {
  readonly domain: string | null
  readonly status: 'pending' | 'verified' | 'failed'
  readonly challenge: CustomDomainChallenge | null
  readonly message?: string
}

export async function connectCustomDomainAction(
  rawWorkspaceId: string,
  rawDomain: string,
): Promise<ActionResult<CustomDomainState>> {
  const parsed = customDomainSchema.safeParse(
    rawDomain
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, ''),
  )
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Enter a domain like shop.yourname.com, without https:// or a path.',
    }
  }
  const domain = parsed.data
  const root = platformRootDomain().toLowerCase()
  if (domain === root || domain.endsWith(`.${root}`)) {
    return { ok: false, error: 'That is a CreatorHub address. Use a domain you own.' }
  }

  return runAction('storefront.domain.connect', async () => {
    const member = await authoriseMember(rawWorkspaceId, 'storefront.manage')
    const token = generateDomainVerificationToken()
    try {
      await inWorkspace(member, async (scope) => {
        const store = await requireStore(scope)
        await storefronts.setCustomDomain(scope, storefrontId(store.id), domain, token)
        await auditLog.writeAuditLog(scope, auditOptions, {
          actorType: 'user',
          actorId: member.actorId as never,
          action: 'storefront.domain_connected',
          targetType: 'storefront',
          targetId: store.id,
          metadata: { domain },
        })
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ActionFailure('That domain is already connected to another store.')
      }
      throw error
    }
    return {
      domain,
      status: 'pending' as const,
      challenge: buildDomainChallenge(domain, token, customDomainTarget()),
    }
  })
}

export async function verifyCustomDomainAction(
  rawWorkspaceId: string,
): Promise<ActionResult<CustomDomainState>> {
  return runAction('storefront.domain.verify', async () => {
    const member = await authoriseMember(rawWorkspaceId, 'storefront.manage')
    const pending = await inWorkspace(member, async (scope) => {
      const store = await requireStore(scope)
      if (!store.customDomain || !store.customDomainVerificationToken) {
        throw new ActionFailure('Connect a domain first.')
      }
      return {
        id: store.id,
        domain: store.customDomain,
        token: store.customDomainVerificationToken,
      }
    })

    // DNS is network I/O, so it runs between transactions, never inside one.
    const check = await verifyCustomDomainDns(pending.domain, pending.token, {
      cnameTarget: customDomainTarget(),
    })

    const status = check.verified ? ('verified' as const) : ('failed' as const)
    await inWorkspace(member, async (scope) => {
      const store = await requireStore(scope)
      // The creator may have switched domains while DNS was being checked.
      if (store.customDomain !== pending.domain) return
      await storefronts.updateCustomDomainStatus(scope, storefrontId(store.id), status)
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: member.actorId as never,
        action: check.verified ? 'storefront.domain_verified' : 'storefront.domain_check_failed',
        targetType: 'storefront',
        targetId: store.id,
        metadata: {
          domain: pending.domain,
          ...(check.verified ? { method: check.method } : { reason: check.reason }),
        },
      })
    })

    return {
      domain: pending.domain,
      status,
      challenge: buildDomainChallenge(pending.domain, pending.token, customDomainTarget()),
      ...(check.verified
        ? {}
        : {
            message:
              check.reason === 'dns_lookup_failed'
                ? 'We could not find any DNS records for this domain yet. New records can take up to an hour to appear.'
                : 'The records are not there yet, or do not match. Check them against the values below.',
          }),
    }
  })
}

export async function removeCustomDomainAction(
  rawWorkspaceId: string,
): Promise<ActionResult<CustomDomainState>> {
  return memberAction(
    'storefront.domain.remove',
    rawWorkspaceId,
    'storefront.manage',
    async (scope, member) => {
      const store = await requireStore(scope)
      await storefronts.setCustomDomain(scope, storefrontId(store.id), null, null)
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: member.actorId as never,
        action: 'storefront.domain_removed',
        targetType: 'storefront',
        targetId: store.id,
        metadata: { domain: store.customDomain },
      })
      return { domain: null, status: 'pending' as const, challenge: null }
    },
  )
}

/**
 * Ingests a privacy-respecting storefront event (page_view, product_view, checkout_started).
 */
export async function recordStorefrontEventAction(
  rawInput: RecordStorefrontEventInput,
  userAgentHeader?: string,
): Promise<
  | { readonly success: true; readonly data: { readonly eventId: string } }
  | { readonly success: false; readonly error: string }
> {
  const parsed = recordStorefrontEventInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid storefront event payload.',
    }
  }

  const {
    storefrontId: sfId,
    productId: pId,
    eventType,
    visitorSessionId,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    metadata,
  } = parsed.data

  const db = getDatabase()
  const sf = await db.resolveStorefrontById(storefrontId(sfId))
  // Only live stores collect visits; a draft or suspended store has no audience.
  if (sf?.status !== 'published') {
    return { success: false, error: 'Storefront not found.' }
  }

  const context = workspaceContext({
    workspaceId: sf.workspaceId,
    requestId: requestId(`req-sf-event-${randomUUID().slice(0, 8)}`),
  })

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const row = await storefronts.recordStorefrontEvent(scope, {
      storefrontId: sf.id,
      productId: pId ? productId(pId) : null,
      eventType,
      visitorSessionId: visitorSessionId ?? null,
      referrer: referrer ?? null,
      userAgent: userAgentHeader?.slice(0, 500) ?? null,
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
      metadata: metadata ?? {},
    })

    return {
      success: true as const,
      data: { eventId: row.id },
    }
  })
}
