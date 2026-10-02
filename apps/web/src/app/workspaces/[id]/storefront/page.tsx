'use client'

/**
 * Workspace Storefront Studio Page (Item 4.8).
 *
 * Responsibilities:
 * - Load workspace storefront configuration, catalogue products, and permissions.
 * - Render loading and error states with workspace recovery navigation.
 * - Mount interactive StorefrontEditor orchestrator inside DashboardShell.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Skeleton, SkeletonText } from '@creatorhub/ui'

import { StorefrontEditor } from '@/components/storefront-editor/StorefrontEditor'
import { getStorefrontEditorDataAction, type StorefrontEditorData } from '@/lib/storefront-actions'

export default function WorkspaceStorefrontPage({
  params,
}: {
  readonly params: Promise<{ id: string }>
}) {
  const { id: workspaceId } = use(params)

  const [data, setData] = useState<StorefrontEditorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getStorefrontEditorDataAction(workspaceId)
      if (!res.success) {
        setError(res.error)
      } else {
        setData(res.data)
      }
      setLoading(false)
    } catch {
      setError('Failed to load storefront studio data. Please try again.')
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    let isMounted = true
    void getStorefrontEditorDataAction(workspaceId)
      .then((res) => {
        if (!isMounted) return
        if (!res.success) {
          setError(res.error)
        } else {
          setData(res.data)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setError('Failed to load storefront studio data. Please try again.')
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [workspaceId])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" shape="text" />
            <SkeletonText lines={1} className="w-32" />
          </div>
          <Skeleton className="h-10 w-28" shape="block" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <SkeletonText lines={8} />
          </div>
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-slate-100 p-6">
            <Skeleton className="h-[450px] w-full" shape="block" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-8 text-center shadow-xl shadow-red-50">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            ⚠️
          </div>
          <h2 className="mt-4 text-lg font-bold text-red-900">Storefront Unavailable</h2>
          <p className="mt-1 text-xs text-red-600 leading-relaxed">
            {error ?? 'Could not load storefront for this workspace.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={`/workspaces/${workspaceId}`}>
              <Button variant="secondary">Back to Hub</Button>
            </Link>
            <Button onClick={() => void loadData()}>Try Again</Button>
          </div>
        </div>
      </div>
    )
  }

  return <StorefrontEditor workspaceId={workspaceId} initialData={data} />
}
