'use client'

/**
 * Workspace Storefront Studio Page (Item 4.8).
 *
 * Responsibilities:
 * - Load workspace storefront configuration, catalogue products, and permissions.
 * - Render loading and error states with workspace recovery navigation.
 * - Mount interactive StorefrontEditor orchestrator.
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
      <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-5 dark:border-neutral-800">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" shape="text" />
              <SkeletonText lines={1} className="w-32" />
            </div>
            <Skeleton className="h-10 w-28" shape="block" />
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <SkeletonText lines={8} />
            </div>
            <div className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-neutral-100 p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <Skeleton className="h-[500px] w-full" shape="block" />
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 dark:border-red-900/50 dark:bg-red-950/20">
            <h1 className="text-xl font-semibold text-red-900 dark:text-red-300">
              Storefront Unavailable
            </h1>
            <p className="mt-2 text-sm text-red-700 dark:text-red-400">
              {error ?? 'Could not load storefront for this workspace.'}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href={`/workspaces/${workspaceId}`}>
                <Button variant="secondary">Back to Workspace</Button>
              </Link>
              <Button onClick={() => void loadData()}>Try Again</Button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return <StorefrontEditor workspaceId={workspaceId} initialData={data} />
}
