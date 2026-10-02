'use client'

/**
 * Single-series area chart over time.
 *
 * Marks follow the dataviz spec: a 2px line in the accent, a ~10% wash
 * beneath it, hairline solid gridlines, an end dot with a surface ring, and a
 * crosshair that snaps to the nearest day with a tooltip. The same tooltip
 * opens from the keyboard (arrow keys move it), and a visually hidden table
 * carries every value for screen readers.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export type AreaPoint = { readonly date: string; readonly value: number }

const HEIGHT = 220
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

function niceMax(max: number): number {
  if (max <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(max))
  const unit = [1, 2, 2.5, 5, 10].find((m) => m * exp >= max) ?? 10
  return unit * exp
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
    new Date(`${iso}T00:00:00`),
  )
}

export function AreaChart({
  data,
  label,
  formatValue,
  formatAxis = formatValue,
}: {
  readonly data: readonly AreaPoint[]
  /** What is plotted, for the accessible name and the table caption. */
  readonly label: string
  readonly formatValue: (value: number) => string
  readonly formatAxis?: (value: number) => string
}) {
  const id = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const node = svgRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, entry.contentRect.width))
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [data.length])

  const { points, max, ticks } = useMemo(() => {
    const maxValue = niceMax(Math.max(0, ...data.map((d) => d.value)))
    const innerW = width - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const step = data.length > 1 ? innerW / (data.length - 1) : 0
    return {
      max: maxValue,
      ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxValue),
      points: data.map((d, i) => ({
        x: PAD.left + i * step,
        y: PAD.top + innerH - (d.value / maxValue) * innerH,
        ...d,
      })),
    }
  }, [data, width])

  if (data.length === 0) return null

  const baseline = (HEIGHT - PAD.bottom).toFixed(1)
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L${(points[points.length - 1]?.x ?? 0).toFixed(1)},${baseline} L${(points[0]?.x ?? 0).toFixed(1)},${baseline} Z`
  const last = points[points.length - 1]
  const hovered = active !== null ? points[active] : null
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(width / 90))))

  function pick(clientX: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || points.length === 0) return
    const x = clientX - rect.left
    let best = 0
    for (let i = 1; i < points.length; i += 1) {
      if (Math.abs((points[i]?.x ?? 0) - x) < Math.abs((points[best]?.x ?? 0) - x)) best = i
    }
    setActive(best)
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') setActive((i) => Math.min((i ?? -1) + 1, points.length - 1))
    if (event.key === 'ArrowLeft') setActive((i) => Math.max((i ?? points.length) - 1, 0))
    if (event.key === 'Escape') setActive(null)
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        role="img"
        aria-label={`${label}. Use the arrow keys to read values.`}
        aria-describedby={`${id}-table`}
        tabIndex={0}
        width="100%"
        height={HEIGHT}
        className="block overflow-visible rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
        onPointerMove={(e) => {
          pick(e.clientX)
        }}
        onPointerLeave={() => {
          setActive(null)
        }}
        onKeyDown={onKey}
        onBlur={() => {
          setActive(null)
        }}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => {
          const y = PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - t / max)
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--border-subtle)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-content-tertiary text-[11px] tabular-nums"
              >
                {formatAxis(t)}
              </text>
            </g>
          )
        })}

        {points.map((p, i) =>
          (i % labelEvery === 0 && points.length - 1 - i >= labelEvery / 2) ||
          i === points.length - 1 ? (
            <text
              key={p.date}
              x={p.x}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-content-tertiary text-[11px]"
            >
              {shortDate(p.date)}
            </text>
          ) : null,
        )}

        <path d={area} fill={`url(#${id}-fill)`} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {last && !hovered && (
          <circle
            cx={last.x}
            cy={last.y}
            r="4"
            fill="var(--accent)"
            stroke="var(--surface-raised)"
            strokeWidth="2"
          />
        )}

        {hovered && (
          <g>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD.top}
              y2={baseline}
              stroke="var(--border-default)"
              strokeWidth="1"
            />
            <circle
              cx={hovered.x}
              cy={hovered.y}
              r="4.5"
              fill="var(--accent)"
              stroke="var(--surface-raised)"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {hovered && (
        <div
          role="status"
          className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-border-subtle bg-surface-overlay px-3 py-2 shadow-elevation-2"
          style={{
            left: Math.min(Math.max(hovered.x - 72, 0), width - 160),
          }}
        >
          <p className="text-body font-semibold text-content-primary tabular-nums">
            {formatValue(hovered.value)}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-caption text-content-secondary">
            <span className="h-0.5 w-3 rounded-full bg-accent" aria-hidden="true" />
            {shortDate(hovered.date)}
          </p>
        </div>
      )}

      <table id={`${id}-table`} className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{shortDate(d.date)}</td>
              <td>{formatValue(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
