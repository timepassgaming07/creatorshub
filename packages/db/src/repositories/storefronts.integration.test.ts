/**
 * Storefront repository integration tests (Item 4.1).
 *
 * Verifies against PostgreSQL 18:
 * 1. Storefront creation with subdomain, custom domain, and theme configuration.
 * 2. Tenant isolation: Workspace A cannot read or update Workspace B's storefront.
 * 3. Subdomain and custom domain case-insensitive uniqueness (via citext).
 * 4. Storefront updating, theme changes, and publishing lifecycle.
 * 5. Custom domain verification state transitions.
 * 6. Subdomain and custom domain lookups.
 */
import {
  requestId,
  storefrontId,
  userId,
  workspaceContext,
  workspaceId,
} from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import * as storefrontsRepo from './storefronts.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

let container: TestDatabase
let control: postgres.Sql
let db: Database

let ws1Id: string
let ws2Id: string
let u1Id: string

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({
    migrationUrl: container.migrationUrl,
    migrationsFolder: MIGRATIONS,
  })

  control = postgres(container.superuserUrl, { max: 10, onnotice: () => undefined })
  db = createDatabase(
    loadDatabaseConfig({
      DATABASE_URL: container.databaseUrl,
      DATABASE_MIGRATION_URL: container.migrationUrl,
      DATABASE_POOL_MAX: '10',
    }),
  )
}, 120_000)

afterAll(async () => {
  await db.close()
  await control.end()
  await container.stop()
})

beforeEach(async () => {
  await control`TRUNCATE TABLE storefronts, users, workspaces CASCADE`

  const [ws1] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug) VALUES ('Workspace One', 'ws-one') RETURNING id
  `
  ws1Id = ws1?.id ?? ''

  const [ws2] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug) VALUES ('Workspace Two', 'ws-two') RETURNING id
  `
  ws2Id = ws2?.id ?? ''

  const [u1] = await control<{ id: string }[]>`
    INSERT INTO users (email) VALUES ('creator1@example.com') RETURNING id
  `
  u1Id = u1?.id ?? ''

  await control`
    INSERT INTO users (email) VALUES ('creator2@example.com')
  `
})

async function inScope<T>(ws: string, fn: (scope: RepositoryScope) => Promise<T>): Promise<T> {
  const context = workspaceContext({
    workspaceId: workspaceId(ws),
    actorId: userId(u1Id),
    requestId: requestId('req-storefront-test'),
  })
  return db.withWorkspace(context, (tx) => fn({ tx, context }))
}

describe('Storefront Repository (Item 4.1)', () => {
  it('creates a storefront with subdomain, custom domain, and theme configuration', async () => {
    const storefront = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.createStorefront(scope, {
        workspaceId: workspaceId(ws1Id),
        subdomain: 'creator-one',
        customDomain: 'shop.creatorone.com',
        title: 'Creator One Store',
        tagline: 'Premium digital templates',
        description: 'Welcome to my official store.',
        themeConfig: {
          accentColor: '#10b981',
          fontPreset: 'sans',
          layoutPreset: 'showcase',
          heroHeadline: 'Build Faster',
          heroSubheadline: 'Production-ready kits for creators',
        },
      })
    })

    expect(storefront.id).toBeDefined()
    expect(storefront.workspaceId).toBe(ws1Id)
    expect(storefront.subdomain).toBe('creator-one')
    expect(storefront.customDomain).toBe('shop.creatorone.com')
    expect(storefront.customDomainStatus).toBe('pending')
    expect(storefront.status).toBe('draft')
    expect(storefront.title).toBe('Creator One Store')
    expect(storefront.themeConfig.accentColor).toBe('#10b981')
    expect(storefront.themeConfig.layoutPreset).toBe('showcase')
    expect(storefront.publishedAt).toBeNull()
  })

  it('enforces tenant isolation: Workspace 2 cannot read Workspace 1 storefront', async () => {
    const s1 = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.createStorefront(scope, {
        workspaceId: workspaceId(ws1Id),
        subdomain: 'tenant-a',
        title: 'Tenant A Storefront',
      })
    })

    // Workspace 2 looking up by ID
    const foundByWs2 = await inScope(ws2Id, async (scope) => {
      return storefrontsRepo.findStorefrontById(scope, storefrontId(s1.id))
    })
    expect(foundByWs2).toBeNull()

    // Workspace 2 finding its own storefront returns null before creation
    const ws2Storefront = await inScope(ws2Id, async (scope) => {
      return storefrontsRepo.findStorefrontByWorkspaceId(scope)
    })
    expect(ws2Storefront).toBeNull()

    // Workspace 2 attempting to update Workspace 1's storefront throws
    await expect(
      inScope(ws2Id, async (scope) => {
        return storefrontsRepo.updateStorefront(scope, storefrontId(s1.id), {
          title: 'Hacked Title',
        })
      }),
    ).rejects.toThrow(/not found or not accessible/i)

    // Nor can it attach a domain to Workspace 1's storefront
    await expect(
      inScope(ws2Id, async (scope) => {
        return storefrontsRepo.setCustomDomain(
          scope,
          storefrontId(s1.id),
          'hijack.example',
          'token',
        )
      }),
    ).rejects.toThrow(/not found or not accessible/i)
  })

  it('enforces case-insensitive unique subdomains across all workspaces', async () => {
    await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.createStorefront(scope, {
        workspaceId: workspaceId(ws1Id),
        subdomain: 'alpha-shop',
        title: 'Alpha Shop',
      })
    })

    // Workspace 2 trying to claim ALPHA-SHOP should fail
    await expect(
      inScope(ws2Id, async (scope) => {
        return storefrontsRepo.createStorefront(scope, {
          workspaceId: workspaceId(ws2Id),
          subdomain: 'ALPHA-SHOP',
          title: 'Duplicate Shop',
        })
      }),
    ).rejects.toThrow()
  })

  it('enforces unique custom domains across all workspaces', async () => {
    await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.createStorefront(scope, {
        workspaceId: workspaceId(ws1Id),
        subdomain: 'shop-one',
        customDomain: 'store.acme.org',
        title: 'Acme One',
      })
    })

    await expect(
      inScope(ws2Id, async (scope) => {
        return storefrontsRepo.createStorefront(scope, {
          workspaceId: workspaceId(ws2Id),
          subdomain: 'shop-two',
          customDomain: 'STORE.ACME.ORG',
          title: 'Acme Two',
        })
      }),
    ).rejects.toThrow()
  })

  it('updates storefront details and publishes', async () => {
    const s1 = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.createStorefront(scope, {
        workspaceId: workspaceId(ws1Id),
        subdomain: 'publish-test',
        title: 'Draft Store',
      })
    })

    expect(s1.status).toBe('draft')
    expect(s1.publishedAt).toBeNull()

    const updated = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.updateStorefront(scope, storefrontId(s1.id), {
        title: 'Published Store',
        tagline: 'New Tagline',
        themeConfig: {
          accentColor: '#3b82f6',
          fontPreset: 'mono',
          layoutPreset: 'grid',
        },
      })
    })

    expect(updated.title).toBe('Published Store')
    expect(updated.tagline).toBe('New Tagline')
    expect(updated.themeConfig.accentColor).toBe('#3b82f6')
    expect(updated.themeConfig.fontPreset).toBe('mono')
    expect(updated.themeConfig.layoutPreset).toBe('grid')

    const published = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.publishStorefront(scope, storefrontId(s1.id))
    })

    expect(published.status).toBe('published')
    expect(published.publishedAt).toBeInstanceOf(Date)
  })

  it('updates custom domain verification status', async () => {
    const s1 = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.createStorefront(scope, {
        workspaceId: workspaceId(ws1Id),
        subdomain: 'domain-verify',
        customDomain: 'store.customdomain.io',
        title: 'Domain Verify Store',
      })
    })

    expect(s1.customDomainStatus).toBe('pending')
    expect(s1.customDomainVerifiedAt).toBeNull()

    const verified = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.updateCustomDomainStatus(scope, storefrontId(s1.id), 'verified')
    })

    expect(verified.customDomainStatus).toBe('verified')
    expect(verified.customDomainVerifiedAt).toBeInstanceOf(Date)

    const failed = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.updateCustomDomainStatus(scope, storefrontId(s1.id), 'failed')
    })

    expect(failed.customDomainStatus).toBe('failed')
  })

  it('finds storefront by subdomain and custom domain within scope', async () => {
    const s1 = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.createStorefront(scope, {
        workspaceId: workspaceId(ws1Id),
        subdomain: 'find-me',
        customDomain: 'findme.com',
        title: 'Find Me Store',
      })
    })

    const bySubdomain = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.findStorefrontBySubdomain(scope, 'FIND-ME')
    })
    expect(bySubdomain?.id).toBe(s1.id)

    const byCustomDomain = await inScope(ws1Id, async (scope) => {
      return storefrontsRepo.findStorefrontByCustomDomain(scope, 'FINDME.COM')
    })
    expect(byCustomDomain?.id).toBe(s1.id)
  })

  it('resolves published storefront by subdomain or custom domain publicly (4.2)', async () => {
    // ws1 creates and publishes a storefront
    const published = await inScope(ws1Id, async (scope) => {
      const sf = await storefrontsRepo.createStorefront(scope, {
        workspaceId: workspaceId(ws1Id),
        subdomain: 'public-subdomain',
        customDomain: 'public-domain.com',
        title: 'Publicly Resolved Store',
      })
      await storefrontsRepo.publishStorefront(scope, storefrontId(sf.id))
      return sf
    })

    // ws2 creates a draft storefront
    await inScope(ws2Id, async (scope) => {
      await storefrontsRepo.createStorefront(scope, {
        workspaceId: workspaceId(ws2Id),
        subdomain: 'draft-subdomain',
        customDomain: 'draft-domain.com',
        title: 'Draft Store',
      })
    })

    // Public resolution by subdomain
    const resolvedBySub = await db.resolveStorefrontByHostname('public-subdomain')
    expect(resolvedBySub).not.toBeNull()
    expect(resolvedBySub?.workspaceId).toBe(ws1Id)
    expect(resolvedBySub?.title).toBe('Publicly Resolved Store')
    expect(resolvedBySub?.status).toBe('published')

    // Public resolution with case-insensitivity
    const resolvedCase = await db.resolveStorefrontByHostname('PUBLIC-SUBDOMAIN')
    expect(resolvedCase).not.toBeNull()
    expect(resolvedCase?.workspaceId).toBe(ws1Id)

    // A custom domain resolves only once DNS proves the creator controls it.
    // Before that, anyone could point a domain they type in at their store.
    expect(await db.resolveStorefrontByHostname('public-domain.com')).toBeNull()
    await inScope(ws1Id, (scope) =>
      storefrontsRepo.updateCustomDomainStatus(
        scope,
        storefrontId(published.id),
        'verified',
        new Date(),
      ),
    )

    // Public resolution by custom domain
    const resolvedByCustom = await db.resolveStorefrontByHostname('PUBLIC-DOMAIN.COM')
    expect(resolvedByCustom).not.toBeNull()
    expect(resolvedByCustom?.workspaceId).toBe(ws1Id)

    // Draft storefronts must not be resolved publicly
    const draftResolved = await db.resolveStorefrontByHostname('draft-subdomain')
    expect(draftResolved).toBeNull()

    // Non-existent hostname returns null
    const unknownResolved = await db.resolveStorefrontByHostname('unknown-domain.io')
    expect(unknownResolved).toBeNull()
  })
})
