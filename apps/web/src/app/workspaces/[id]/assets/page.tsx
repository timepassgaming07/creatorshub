'use client'

/**
 * Workspace Asset Management Screen — Production-Grade.
 *
 * Responsibilities:
 * - Render all media, download, and course deliverable assets across 4 states.
 * - Display security scan status badges (Clean, Pending, Infected, Skipped).
 * - Upload Asset modal powered by AssetUploader with progress and failure recovery.
 * - Clean integration in DashboardShell.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
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

function formatFileType(mime: string): { label: string; icon: string } {
  const m = mime.toLowerCase()
  if (m.includes('pdf')) return { label: 'PDF Document', icon: '📄' }
  if (m.includes('zip') || m.includes('tar') || m.includes('compressed')) return { label: 'ZIP Archive', icon: '📦' }
  if (m.includes('video') || m.includes('mp4')) return { label: 'Video File', icon: '🎬' }
  if (m.includes('audio') || m.includes('mpeg') || m.includes('mp3')) return { label: 'Audio / Music', icon: '🎵' }
  if (m.includes('image')) return { label: 'Image', icon: '🖼️' }
  if (m.includes('text') || m.includes('markdown')) return { label: 'Text Document', icon: '📝' }
  return { label: mime.split('/')[1]?.toUpperCase() || 'Digital File', icon: '📁' }
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
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
          <div className="space-y-2">
            <Skeleton className="h-8 w-44" shape="text" />
            <SkeletonText lines={1} className="w-48" />
          </div>
          <Skeleton className="h-10 w-32" shape="block" />
        </div>
        <div className="rounded-2xl border border-border-subtle bg-surface-raised p-6 shadow-xs">
          <SkeletonText lines={6} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-rose-500/20 bg-surface-raised p-8 text-center shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            ⚠️
          </div>
          <h2 className="mt-4 text-lg font-bold text-content-primary">{error.title}</h2>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 leading-relaxed">{error.detail}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={`/workspaces/${workspaceId}`}>
              <Button variant="secondary">Back to Hub</Button>
            </Link>
            <Button onClick={() => void loadAssets()}>Try Again</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Navigation & Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border-subtle"
      >
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-content-tertiary">
            <Link href={`/workspaces/${workspaceId}`} className="hover:text-content-primary transition-colors">
              Workspace
            </Link>
            <span>/</span>
            <span className="text-content-primary">Assets</span>
          </div>
          <h1 className="mt-1 text-2xl font-black text-content-primary tracking-tight">
            Digital Asset Vault
          </h1>
          <p className="mt-0.5 text-xs text-content-secondary">
            Manage your uploaded deliverables, video masterclasses, eBooks, and media assets.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            setUploadDialogOpen(true)
          }}
        >
          + Upload Asset
        </Button>
      </motion.div>

      {/* Asset Table */}
      {assets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border border-dashed border-border-control bg-surface-raised p-12 text-center shadow-xs"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 text-2xl text-sky-600 dark:text-sky-400">
            📁
          </div>
          <h2 className="mt-4 text-base font-bold text-content-primary">
            No assets uploaded yet
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-content-secondary leading-relaxed">
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
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-xs"
        >
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-surface-sunken font-semibold text-content-secondary">
              <tr>
                <th scope="col" className="px-6 py-3.5">
                  File Name
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Format
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Size
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Security Check
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {assets.map((asset) => {
                const fileType = formatFileType(asset.mimeType)
                return (
                  <tr
                    key={asset.id}
                    className="hover:bg-surface-sunken/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-content-primary">
                        {asset.originalFilename}
                      </div>
                      <div className="font-mono text-[10px] text-content-tertiary">{asset.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-content-primary border border-border-subtle">
                        <span>{fileType.icon}</span>
                        <span>{fileType.label}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-content-primary">
                      {formatBytes(asset.byteSize)}
                    </td>
                    <td className="px-6 py-4">
                      <ScanStatusBadge status={asset.scanStatus} reason={asset.scanReason} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Upload Dialog */}
      <Dialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        title="Upload Deliverable Asset"
        description="Select a file to scan and upload directly to your S3/R2 storage vault."
      >
        <div className="mt-4">
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
  )
}

function ScanStatusBadge({
  status,
  reason,
}: {
  readonly status: string
  readonly reason?: string | null
}) {
  if (status === 'clean') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Clean & Verified
      </span>
    )
  }
  if (status === 'infected') {
    return (
      <span
        title={reason ?? 'Malware detected'}
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 border border-rose-500/20"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Infected
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-0.5 text-[10px] font-bold text-content-secondary border border-border-subtle">
        <span className="h-1.5 w-1.5 rounded-full bg-content-tertiary" />
        Skipped
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      Scanning...
    </span>
  )
}
