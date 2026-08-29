'use client'

/**
 * Workspace Asset Management Screen (Item 3.8).
 *
 * Responsibilities:
 * - Render all media, download, and course deliverable assets across 4 states.
 * - Display security scan status badges (Clean, Pending, Infected, Skipped).
 * - Upload Asset modal powered by AssetUploader with progress and failure recovery.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Dialog, Skeleton, SkeletonText } from '@creatorhub/ui'

import { AssetUploader } from '@/components/AssetUploader'
import { listWorkspaceAssetsAction, type AssetSummaryDisplay } from '@/lib/asset-actions'

function formatBytes(bytesStr: string): string {
  try {
    const bytes = Number(bytesStr)
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i] ?? 'B'}`
  } catch {
    return `${bytesStr} B`
  }
}

export default function AssetsPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id: workspaceId } = use(params)

  const [assets, setAssets] = useState<readonly AssetSummaryDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; detail: string; status: number } | null>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)

  const loadAssets = useCallback(async () => {
    try {
      const res = await listWorkspaceAssetsAction(workspaceId)
      if (!res.success) {
        setError({
          title: res.error.title,
          detail: res.error.detail,
          status: res.error.status,
        })
        setLoading(false)
        return
      }

      setAssets(res.data)
      setLoading(false)
    } catch {
      setError({
        title: 'Not Found',
        detail: 'We could not find assets for this workspace.',
        status: 404,
      })
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    let isMounted = true
    void listWorkspaceAssetsAction(workspaceId)
      .then((res) => {
        if (!isMounted) return
        if (!res.success) {
          setError({
            title: res.error.title,
            detail: res.error.detail,
            status: res.error.status,
          })
        } else {
          setAssets(res.data)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setError({
          title: 'Not Found',
          detail: 'We could not find assets for this workspace.',
          status: 404,
        })
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [workspaceId])

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-5 dark:border-neutral-800">
            <div>
              <Skeleton className="h-8 w-44" shape="text" />
              <SkeletonText lines={1} className="mt-2 w-48" />
            </div>
            <Skeleton className="h-10 w-32" shape="block" />
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <SkeletonText lines={6} />
          </div>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 dark:border-red-900/50 dark:bg-red-950/20">
            <h1 className="text-xl font-semibold text-red-900 dark:text-red-300">{error.title}</h1>
            <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error.detail}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href={`/workspaces/${workspaceId}`}>
                <Button variant="secondary">Back to Workspace</Button>
              </Link>
              <Button onClick={() => void loadAssets()}>Try Again</Button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Navigation & Header */}
        <div>
          <nav className="mb-4 flex items-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
            <Link
              href={`/workspaces/${workspaceId}`}
              className="hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Workspace
            </Link>
            <span className="mx-2">/</span>
            <span className="text-neutral-900 dark:text-neutral-100">Assets</span>
          </nav>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5 dark:border-neutral-800">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Asset Library
              </h1>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Manage your uploaded deliverables, videos, eBooks, and media assets.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                setUploadDialogOpen(true)
              }}
            >
              Upload Asset
            </Button>
          </div>
        </div>

        {/* Asset Table */}
        {assets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              No assets uploaded yet
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Upload course videos, ZIP bundles, or PDF deliverables to attach to your products.
            </p>
            <div className="mt-6">
              <Button
                variant="primary"
                onClick={() => {
                  setUploadDialogOpen(true)
                }}
              >
                Upload First Asset
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider dark:text-neutral-400"
                  >
                    File Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider dark:text-neutral-400"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider dark:text-neutral-400"
                  >
                    Size
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider dark:text-neutral-400"
                  >
                    Safety Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {assets.map((asset) => (
                  <tr
                    key={asset.id}
                    className="hover:bg-neutral-50/50 transition-colors dark:hover:bg-neutral-800/30"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {asset.originalFilename}
                      </div>
                      <div className="text-xs text-neutral-400 font-mono">{asset.id}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-xs font-mono text-neutral-500 dark:text-neutral-400">
                      {asset.mimeType}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-700 dark:text-neutral-300">
                      {formatBytes(asset.byteSize)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <ScanStatusBadge status={asset.scanStatus} reason={asset.scanReason} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload Dialog */}
        <Dialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          title="Upload New Asset"
          description="Direct upload with presigned security credentials and automated safety scanning."
        >
          <div className="py-4">
            <AssetUploader
              workspaceId={workspaceId}
              onUploadComplete={() => {
                setUploadDialogOpen(false)
                void loadAssets()
              }}
            />
          </div>
        </Dialog>
      </div>
    </main>
  )
}

function ScanStatusBadge({
  status,
  reason,
}: {
  readonly status: string
  readonly reason: string | null
}) {
  if (status === 'clean') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
        ✓ Clean
      </span>
    )
  }
  if (status === 'infected') {
    return (
      <span
        title={reason ?? 'Malware detected'}
        className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400"
      >
        ! Infected / Blocked
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
      Scanning...
    </span>
  )
}
