'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FileWarning, ImageIcon, Package, Plus, Search } from 'lucide-react'
import { Button } from '@creatorhub/ui'

import { Badge, EmptyState, PageHeader, Segmented, Table, Td, Th } from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import type { ProductRow } from '@/lib/dashboard-data'
import { formatAmount, formatRelative } from '@/lib/format'

type Filter = 'all' | 'published' | 'draft' | 'archived'

export function ProductsView({ products }: { readonly products: readonly ProductRow[] }) {
  const { basePath } = useWorkspace()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter(
      (p) => (filter === 'all' || p.status === filter) && (!q || p.title.toLowerCase().includes(q)),
    )
  }, [products, filter, query])

  const newButton = (
    <Button asChild>
      <Link href={`${basePath}/products/new`}>
        <Plus className="size-4" aria-hidden="true" />
        New product
      </Link>
    </Button>
  )

  return (
    <div>
      <PageHeader
        title="Products"
        description="Everything you sell, from free guides to full courses."
        actions={products.length > 0 ? newButton : undefined}
      />

      {products.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="Create your first product"
          description="A preset pack, an ebook, a template, a free lead magnet. Upload the file, set a price, and it is ready to sell."
          action={newButton}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented<Filter>
              label="Filter products"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `All ${String(products.length)}` },
                { value: 'published', label: 'Published' },
                { value: 'draft', label: 'Drafts' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <label className="relative block sm:w-64">
              <span className="sr-only">Search products</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-tertiary"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                }}
                placeholder="Search products"
                className="h-9 w-full rounded-lg border border-border-control bg-surface-raised pr-3 pl-9 text-body placeholder:text-content-tertiary focus:outline-none focus-visible:border-border-strong"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <EmptyState title="No products match" description="Try another filter or search." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Status</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Sold</Th>
                  <Th align="right">Revenue</Th>
                  <Th align="right">Updated</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} className="group transition-colors hover:bg-surface-sunken/50">
                    <Td>
                      <Link
                        href={`${basePath}/products/${p.id}`}
                        className="flex items-center gap-3"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-surface-sunken">
                          {p.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- media route
                            <img src={p.coverUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <ImageIcon
                              className="size-4 text-content-tertiary"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium group-hover:underline group-hover:underline-offset-2">
                            {p.title}
                          </span>
                          <span className="flex items-center gap-1.5 text-caption text-content-tertiary">
                            {p.fileCount === 0 ? (
                              <>
                                <FileWarning className="size-3 text-caution" aria-hidden="true" />
                                No file attached
                              </>
                            ) : (
                              `${String(p.fileCount)} ${p.fileCount === 1 ? 'file' : 'files'}`
                            )}
                            {p.visibility !== 'public' && ` · ${p.visibility}`}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          p.status === 'published'
                            ? 'positive'
                            : p.status === 'draft'
                              ? 'neutral'
                              : 'caution'
                        }
                        dot
                      >
                        {p.status === 'published'
                          ? 'Published'
                          : p.status === 'draft'
                            ? 'Draft'
                            : 'Archived'}
                      </Badge>
                    </Td>
                    <Td align="right">
                      {BigInt(p.price) === 0n
                        ? 'Free'
                        : formatAmount(p.price, p.currency, { compact: true })}
                    </Td>
                    <Td align="right">{p.unitsSold.toLocaleString('en-IN')}</Td>
                    <Td align="right">
                      {formatAmount(p.revenueMinor, p.currency, { compact: true })}
                    </Td>
                    <Td align="right" className="text-content-tertiary">
                      <span suppressHydrationWarning>{formatRelative(p.updatedAt)}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </div>
  )
}
