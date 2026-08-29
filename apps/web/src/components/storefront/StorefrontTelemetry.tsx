/**
 * Client-side storefront telemetry beacon component (Item 4.7).
 * Emits privacy-respecting page_view and product_view events with UTM attribution.
 */
'use client'

import { useEffect, useRef } from 'react'
import type { StorefrontEventType } from '@creatorhub/contracts'

type StorefrontTelemetryProps = {
  readonly storefrontId: string
  readonly productId?: string | undefined
  readonly eventType?: StorefrontEventType | undefined
}

function getOrCreateVisitorSessionId(): string {
  try {
    const key = 'ch_visitor_session_id'
    let id = window.sessionStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID()
      window.sessionStorage.setItem(key, id)
    }
    return id
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2, 11)
  }
}

export function StorefrontTelemetry({
  storefrontId,
  productId,
  eventType,
}: StorefrontTelemetryProps) {
  const sentRef = useRef(false)

  useEffect(() => {
    if (sentRef.current) return
    sentRef.current = true

    const actualEventType = eventType ?? (productId ? 'product_view' : 'page_view')
    const visitorSessionId = getOrCreateVisitorSessionId()
    const urlParams = new URLSearchParams(window.location.search)

    const payload = {
      storefrontId,
      productId: productId ?? null,
      eventType: actualEventType,
      visitorSessionId,
      referrer: document.referrer || null,
      utmSource: urlParams.get('utm_source'),
      utmMedium: urlParams.get('utm_medium'),
      utmCampaign: urlParams.get('utm_campaign'),
    }

    const jsonPayload = JSON.stringify(payload)

    if ('sendBeacon' in navigator) {
      const blob = new Blob([jsonPayload], { type: 'application/json' })
      navigator.sendBeacon('/api/events', blob)
    } else {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonPayload,
        keepalive: true,
      }).catch(() => {
        // Silently discard telemetry network errors
      })
    }
  }, [storefrontId, productId, eventType])

  return null
}
