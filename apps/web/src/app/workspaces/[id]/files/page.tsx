import type { Metadata } from 'next'
import { catalogue } from '@creatorhub/db'

import { FilesView } from '@/components/products/FilesView'
import { asMember } from '@/lib/dashboard-data'

export const metadata: Metadata = { title: 'Files' }

export default async function FilesPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params
  const files = await asMember(id, 'product.view', async (scope) => {
    const assets = await catalogue.listAssets(scope)
    return assets.map((a) => ({
      id: a.id,
      filename: a.originalFilename,
      mimeType: a.mimeType,
      byteSize: a.byteSize.toString(),
      scanStatus: a.scanStatus,
      createdAt: a.createdAt.toISOString(),
      previewUrl: a.mimeType.startsWith('image/')
        ? `/api/media/${scope.context.workspaceId}/${a.id}`
        : null,
    }))
  })
  return <FilesView files={files} />
}
