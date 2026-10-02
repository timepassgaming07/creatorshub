/**
 * GET /api/media/[workspaceId]/[assetId]
 *
 * Serves shop-window images: product covers and galleries on published
 * products, and a published store's logo and banner. Anything else, including
 * every file a buyer pays for, answers 404 here. Bytes are streamed through
 * this route rather than redirected to a signed URL, so the browser can cache
 * them for a day without caching an expiring link.
 */
import { assetId as toAssetId, requestId, workspaceContext, workspaceId } from '@creatorhub/contracts'
import { catalogue, storefronts } from '@creatorhub/db'
import { isAssetDeliverable } from '@creatorhub/storage'
import { NextResponse } from 'next/server'

import { getDatabase } from '@/lib/db'
import { getStorageDriver } from '@/lib/storage'
import { getWorkspaceAccess } from '@/lib/workspace-access'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

function notFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ workspaceId: string; assetId: string }> },
): Promise<Response> {
  const { workspaceId: rawWs, assetId: rawAsset } = await props.params
  if (!UUID.test(rawWs) || !UUID.test(rawAsset)) return notFound()

  const context = workspaceContext({
    workspaceId: workspaceId(rawWs),
    requestId: requestId(`req-media-${rawAsset.slice(-8)}`),
  })

  const result = await getDatabase().withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const found = await catalogue.findAssetById(scope, toAssetId(rawAsset))
    if (!found || !IMAGE_TYPES.has(found.mimeType) || !isAssetDeliverable(found)) return null

    if (await catalogue.isPublicProductImage(scope, found.id as never)) {
      return { asset: found, isPublic: true }
    }

    const store = await storefronts.findStorefrontByWorkspaceId(scope)
    const theme = store?.themeConfig
    const isStoreImage =
      store?.status === 'published' &&
      (theme?.logoAssetId === found.id || theme?.bannerAssetId === found.id)
    return { asset: found, isPublic: isStoreImage }
  })

  if (!result) return notFound()
  // Draft images are visible to the workspace's own members only.
  if (!result.isPublic) {
    const { access } = await getWorkspaceAccess(rawWs)
    if (!access) return notFound()
  }
  const asset = result.asset

  const object = await getStorageDriver().getObject(asset.storageKey)
  if (!object) return notFound()

  return new Response(new Uint8Array(object.data), {
    status: 200,
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(object.data.byteLength),
      'Cache-Control': result.isPublic
        ? 'public, max-age=86400, stale-while-revalidate=604800'
        : 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // An image, never a document: an uploaded SVG or HTML cannot run here.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  })
}
