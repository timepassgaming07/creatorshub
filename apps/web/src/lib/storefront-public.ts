/**
 * Public storefront data: what a buyer sees.
 *
 * Not a server-action module. These run from server components only, so no
 * client can call them with arbitrary arguments.
 *
 * A published store is readable by anyone (the storefronts RLS policy admits
 * published rows). A draft store renders only for a signed-in member of its
 * workspace, who passes `?preview=<workspaceId>`; membership is checked under
 * both isolation layers before anything is read.
 */
import { randomUUID } from 'node:crypto'
import {
  productId,
  requestId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type StorefrontTheme,
  type WorkspaceContext,
} from '@creatorhub/contracts'
import { catalogue, storefronts, type RepositoryScope } from '@creatorhub/db'

import { getDatabase } from './db'
import { storefrontUrl } from './env'
import { getWorkspaceAccess } from './workspace-access'

export type PublicStore = {
  readonly id: string
  readonly workspaceId: string
  readonly subdomain: string
  readonly url: string
  readonly title: string
  readonly tagline: string | null
  readonly description: string | null
  readonly theme: StorefrontTheme
  readonly logoUrl: string | null
  readonly bannerUrl: string | null
  readonly isPreview: boolean
}

export type PublicProductCard = {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly excerpt: string | null
  readonly price: string
  readonly compareAtPrice: string | null
  readonly currency: string
  readonly coverUrl: string | null
  readonly fileCount: number
}

export type PublicProductDetail = PublicProductCard & {
  readonly description: string | null
  readonly gallery: readonly string[]
  readonly files: readonly { readonly name: string; readonly size: string; readonly type: string }[]
  readonly variants: readonly { readonly id: string; readonly title: string; readonly price: string }[]
}

export function mediaUrl(workspaceId: string, assetId: string): string {
  return `/api/media/${workspaceId}/${assetId}`
}

function excerpt(text: string | null, max = 140): string | null {
  if (!text) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

async function openStore(
  host: string,
  previewWorkspaceId: string | undefined,
): Promise<{ context: WorkspaceContext; isPreview: boolean } | null> {
  const clean = host.trim().toLowerCase()
  if (!clean || clean.length > 253) return null

  const resolved = await getDatabase().resolveStorefrontByHostname(clean)
  if (resolved?.status === 'published') {
    return {
      context: workspaceContext({
        workspaceId: resolved.workspaceId,
        requestId: requestId(`req-store-${randomUUID().slice(0, 8)}`),
      }),
      isPreview: false,
    }
  }

  if (!previewWorkspaceId) return null
  const { access } = await getWorkspaceAccess(previewWorkspaceId)
  if (!access?.storefront) return null
  if (access.storefront.subdomain.toLowerCase() !== clean) return null

  return {
    context: workspaceContext({
      workspaceId: toWorkspaceId(access.workspace.id),
      actorId: access.session.userId,
      requestId: requestId(`req-preview-${randomUUID().slice(0, 8)}`),
    }),
    isPreview: true,
  }
}

export async function storeRecord(scope: RepositoryScope, isPreview: boolean): Promise<PublicStore | null> {
  const sf = await storefronts.findStorefrontByWorkspaceId(scope)
  if (!sf) return null
  const ws = scope.context.workspaceId
  return {
    id: sf.id,
    workspaceId: ws,
    subdomain: sf.subdomain,
    url: storefrontUrl(sf.subdomain),
    title: sf.title,
    tagline: sf.tagline,
    description: sf.description,
    theme: sf.themeConfig,
    logoUrl: sf.themeConfig.logoAssetId ? mediaUrl(ws, sf.themeConfig.logoAssetId) : null,
    bannerUrl: sf.themeConfig.bannerAssetId ? mediaUrl(ws, sf.themeConfig.bannerAssetId) : null,
    isPreview,
  }
}

export async function cardFor(
  scope: RepositoryScope,
  product: Awaited<ReturnType<typeof catalogue.listProducts>>[number],
): Promise<PublicProductCard> {
  const files = await catalogue.listAssetsForProduct(scope, productId(product.id))
  const cover =
    files.find((f) => f.productAsset.role === 'cover_image') ??
    files.find((f) => f.productAsset.role === 'thumbnail')
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    excerpt: excerpt(product.description),
    price: product.basePrice.toString(),
    compareAtPrice: product.compareAtPrice?.toString() ?? null,
    currency: product.currency,
    coverUrl: cover ? mediaUrl(scope.context.workspaceId, cover.asset.id) : null,
    fileCount: files.filter((f) => f.productAsset.role === 'deliverable').length,
  }
}

export async function loadStore(
  host: string,
  options: { readonly preview?: string | undefined } = {},
): Promise<{ store: PublicStore; products: PublicProductCard[] } | null> {
  const opened = await openStore(host, options.preview)
  if (!opened) return null

  return getDatabase().withWorkspace(opened.context, async (tx) => {
    const scope = { tx, context: opened.context }
    const store = await storeRecord(scope, opened.isPreview)
    if (!store) return null
    const listed = (await catalogue.listProducts(scope, { status: 'published' })).filter(
      (p) => p.visibility === 'public',
    )
    const products: PublicProductCard[] = []
    for (const product of listed) products.push(await cardFor(scope, product))
    return { store, products }
  })
}

export async function loadProduct(
  host: string,
  slug: string,
  options: { readonly preview?: string | undefined } = {},
): Promise<{ store: PublicStore; product: PublicProductDetail } | null> {
  const opened = await openStore(host, options.preview)
  if (!opened) return null

  return getDatabase().withWorkspace(opened.context, async (tx) => {
    const scope = { tx, context: opened.context }
    const store = await storeRecord(scope, opened.isPreview)
    if (!store) return null
    const product = await catalogue.findProductBySlug(scope, slug)
    // Unlisted products open by direct link; private ones never do.
    if (!product || product.visibility === 'private') return null
    if (product.status !== 'published' && !opened.isPreview) return null

    const files = await catalogue.listAssetsForProduct(scope, productId(product.id))
    const variants = (await catalogue.listVariantsForProduct(scope, productId(product.id)))
      .filter((v) => v.isActive)
      .sort((a, b) => a.position - b.position)
    const card = await cardFor(scope, product)

    return {
      store,
      product: {
        ...card,
        description: product.description,
        gallery: files
          .filter((f) => f.productAsset.role === 'gallery')
          .map((f) => mediaUrl(scope.context.workspaceId, f.asset.id)),
        files: files
          .filter((f) => f.productAsset.role === 'deliverable')
          .map((f) => ({
            name: f.asset.originalFilename,
            size: f.asset.byteSize.toString(),
            type: f.asset.mimeType,
          })),
        variants: variants.map((v) => ({
          id: v.id,
          title: v.title,
          price: (v.priceOverride ?? product.basePrice).toString(),
        })),
      },
    }
  })
}
