/**
 * Ranked horizontal bars: top products, funnel steps, referrers.
 *
 * Bars are capped at 8px tall with a 4px rounded end, grow from one baseline,
 * and carry their value as text beside them, in text tokens, so nothing is
 * read from colour alone.
 */
export type BarListItem = {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly display: string
  readonly sublabel?: string
}

export function BarList({ items, emptyLabel = 'No data yet' }: { readonly items: readonly BarListItem[]; readonly emptyLabel?: string }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-body text-content-tertiary">{emptyLabel}</p>
  }
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-4 text-body">
            <span className="min-w-0 truncate text-content-primary">
              {item.label}
              {item.sublabel && <span className="ml-2 text-caption text-content-tertiary">{item.sublabel}</span>}
            </span>
            <span className="shrink-0 font-medium text-content-primary tabular-nums">{item.display}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-sunken">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${Math.max(2, (item.value / max) * 100).toFixed(1)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
