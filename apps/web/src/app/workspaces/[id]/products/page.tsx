'use client'

/**
 * Workspace Products List Screen — Production-Grade.
 *
 * Responsibilities:
 * - Render product catalogue table across all states.
 * - Quick Smart File Upload & Auto-Generate details directly from this page.
 * - Display title, slug, status badges (Draft, Published, Archived), currency, and price.
 * - "New Product" & "Smart Upload" actions.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'
import { Button, Skeleton, SkeletonText } from '@creatorhub/ui'
import { getProductListDataAction, type ProductListData } from '@/lib/catalogue-actions'
import { SmartProductUpload } from '@/components/products/SmartProductUpload'

function formatPriceDisplay(amountStr: string, currencyCode: string): string {
  try {
    const minor = BigInt(amountStr)
    const major = Number(minor) / 100
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode,
    }).format(major)
  } catch {
    return `${amountStr} ${currencyCode}`
  }
}

export default function ProductsListPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id: workspaceId } = use(params)

  const [data, setData] = useState<ProductListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; detail: string; status: number } | null>(null)
  const [showQuickUpload, setShowQuickUpload] = useState(false)

  const loadProducts = useCallback(async () => {
    try {
      const res = await getProductListDataAction(workspaceId)
      if (!res.success) {
        setError({
          title: res.error.title,
          detail: res.error.detail,
          status: res.error.status,
        })
        setLoading(false)
        return
      }

      setData(res.data)
      setLoading(false)
    } catch {
      setError({
        title: 'Not Found',
        detail: 'We could not find products for this workspace.',
        status: 404,
      })
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    let isMounted = true
    void getProductListDataAction(workspaceId)
      .then((res) => {
        if (!isMounted) return
        if (!res.success) {
          setError({
            title: res.error.title,
            detail: res.error.detail,
            status: res.error.status,
          })
        } else {
          setData(res.data)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setError({
          title: 'Not Found',
          detail: 'We could not find products for this workspace.',
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
        <div className="w-full max-w-md rounded-3xl border border-red-500/30 bg-surface-raised p-8 text-center shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-600">
            ⚠️
          </div>
          <h2 className="mt-4 text-lg font-bold text-content-primary">{error.title}</h2>
          <p className="mt-1 text-xs text-content-secondary leading-relaxed">{error.detail}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={`/workspaces/${workspaceId}`}>
              <Button variant="secondary">Back to Hub</Button>
            </Link>
            <Button onClick={() => void loadProducts()}>Try Again</Button>
          </div>
        </div>
      </div>
    )
  }

  const products = data?.products ?? []

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border-subtle"
      >
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-content-tertiary">
            <Link href={`/workspaces/${workspaceId}`} className="hover:text-content-primary transition-colors">
              {data?.workspace.name}
            </Link>
            <span>/</span>
            <span className="text-content-primary">Products</span>
          </div>
          <h1 className="mt-1 text-2xl font-black text-content-primary tracking-tight">
            Product Catalogue
          </h1>
          <p className="mt-0.5 text-xs text-content-secondary">
            Manage your digital courses, templates, deliverables, and pricing.
          </p>
        </div>

        {data?.canCreate && (
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={() => setShowQuickUpload(!showQuickUpload)}
              className="rounded-xl border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10"
            >
              {showQuickUpload ? '✕ Close Quick Upload' : '⚡ Quick File Auto-List'}
            </Button>
            <Link href={`/workspaces/${workspaceId}/products/new`}>
              <Button variant="primary" className="rounded-xl">
                + New Product
              </Button>
            </Link>
          </div>
        )}
      </motion.div>

      {/* Expandable Smart File Auto-List Dropzone */}
      <AnimatePresence>
        {showQuickUpload && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <SmartProductUpload
              workspaceId={workspaceId}
              onProductCreated={() => {
                setShowQuickUpload(false)
                void loadProducts()
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Table or Empty State */}
      {products.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border border-dashed border-border-control bg-surface-raised p-12 text-center shadow-xs space-y-6"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-2xl text-accent">
            📦
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-content-primary">
              No products in your catalogue yet
            </h2>
            <p className="mx-auto max-w-sm text-xs text-content-secondary leading-relaxed">
              Upload your first digital file (ZIP, MP4, PDF, Preset) to auto-generate details and list it in 1 click.
            </p>
          </div>

          {data?.canCreate && (
            <div className="max-w-xl mx-auto pt-2">
              <SmartProductUpload
                workspaceId={workspaceId}
                onProductCreated={() => void loadProducts()}
              />
            </div>
          )}
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
                  Product
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Status
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Price
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Visibility
                </th>
                <th scope="col" className="px-6 py-3.5 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-surface-overlay/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/workspaces/${workspaceId}/products/${product.id}`}
                      className="font-bold text-content-primary hover:text-accent transition-colors block"
                    >
                      {product.title}
                    </Link>
                    <span className="font-mono text-[11px] text-content-tertiary">
                      /{product.slug}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={product.status} />
                  </td>
                  <td className="px-6 py-4 font-bold text-content-primary">
                    {formatPriceDisplay(product.basePrice, product.currency)}
                    {product.compareAtPrice && (
                      <span className="ml-2 text-[11px] text-content-tertiary font-normal line-through">
                        {formatPriceDisplay(product.compareAtPrice, product.currency)}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 capitalize text-content-secondary">
                    {product.visibility}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/workspaces/${workspaceId}/products/${product.id}`}
                      className="inline-flex items-center gap-1 font-bold text-accent hover:underline transition-colors"
                    >
                      <span>Edit</span>
                      <span>→</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { readonly status: string }) {
  if (status === 'active' || status === 'published') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    )
  }
  if (status === 'archived') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken border border-border-subtle px-2.5 py-0.5 text-[10px] font-bold text-content-tertiary">
        <span className="h-1.5 w-1.5 rounded-full bg-content-tertiary" />
        Archived
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Draft
    </span>
  )
}
