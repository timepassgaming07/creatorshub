'use client'

/**
 * Workspace Products List Screen (Item 3.7).
 *
 * Responsibilities:
 * - Render product catalogue table across all 4 states (loading, empty, error, populated).
 * - Display title, slug, status badges (Draft, Published, Archived), currency, and price.
 * - "New Product" primary action button if authorized.
 * - Links to product edit / publish screens.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Skeleton, SkeletonText } from '@creatorhub/ui'

import { getProductListDataAction, type ProductListData } from '@/lib/catalogue-actions'

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
              <Button onClick={() => void loadProducts()}>Try Again</Button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const products = data?.products ?? []

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
              {data?.workspace.name}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-neutral-900 dark:text-neutral-100">Products</span>
          </nav>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5 dark:border-neutral-800">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Products
              </h1>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Manage your digital courses, downloads, and catalogue items.
              </p>
            </div>
            {data?.canCreate && (
              <Link href={`/workspaces/${workspaceId}/products/new`}>
                <Button variant="primary">New Product</Button>
              </Link>
            )}
          </div>
        </div>

        {/* Product Roster */}
        {products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              No products yet
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Get started by creating your first digital product or course.
            </p>
            {data?.canCreate && (
              <div className="mt-6">
                <Link href={`/workspaces/${workspaceId}/products/new`}>
                  <Button variant="primary">Create Product</Button>
                </Link>
              </div>
            )}
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
                    Product
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider dark:text-neutral-400"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider dark:text-neutral-400"
                  >
                    Price
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider dark:text-neutral-400"
                  >
                    Visibility
                  </th>
                  <th scope="col" className="relative px-6 py-3.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-neutral-50/50 transition-colors dark:hover:bg-neutral-800/30"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div>
                        <Link
                          href={`/workspaces/${workspaceId}/products/${product.id}`}
                          className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                        >
                          {product.title}
                        </Link>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          /{product.slug}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {formatPriceDisplay(product.basePrice, product.currency)}
                      {product.compareAtPrice && (
                        <span className="ml-2 text-xs text-neutral-400 line-through">
                          {formatPriceDisplay(product.compareAtPrice, product.currency)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500 capitalize dark:text-neutral-400">
                      {product.visibility}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <Link
                        href={`/workspaces/${workspaceId}/products/${product.id}`}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}

function StatusBadge({ status }: { readonly status: string }) {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
        Published
      </span>
    )
  }
  if (status === 'archived') {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        Archived
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
      Draft
    </span>
  )
}
