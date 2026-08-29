/**
 * Storefront product grid component (Item 4.4).
 */
import type { ThemeLayoutPreset } from '@creatorhub/contracts'
import { LAYOUT_PRESET_MAP } from '@/lib/theme'
import { ProductCard, type StorefrontProductItem } from './ProductCard'

type ProductGridProps = {
  readonly products: readonly StorefrontProductItem[]
  readonly basePath: string
  readonly accentColor?: string | undefined
  readonly layoutPreset?: ThemeLayoutPreset | undefined
}

export function ProductGrid({
  products,
  basePath,
  accentColor,
  layoutPreset = 'showcase',
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] p-12 text-center">
        <svg
          className="mx-auto h-12 w-12 text-[var(--text-tertiary)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
          No products available
        </h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          This creator hasn&apos;t published any products yet. Check back soon!
        </p>
      </div>
    )
  }

  const gridCols = LAYOUT_PRESET_MAP[layoutPreset].gridCols

  return (
    <div className={`grid gap-6 ${gridCols}`}>
      {products.map((prod) => (
        <ProductCard key={prod.id} product={prod} basePath={basePath} accentColor={accentColor} />
      ))}
    </div>
  )
}
