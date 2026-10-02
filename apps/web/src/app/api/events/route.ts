/**
 * Public storefront event telemetry ingestion API endpoint (Item 4.7).
 * Supports standard JSON POST and navigator.sendBeacon requests.
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { RecordStorefrontEventInput } from '@creatorhub/contracts'
import { recordStorefrontEventAction } from '../../../lib/storefront-actions'

const MAX_EVENT_BYTES = 8 * 1024

export async function POST(request: NextRequest): Promise<NextResponse> {
  // A page-view beacon is a few hundred bytes; refuse anything that is not one.
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_EVENT_BYTES) return NextResponse.json({ error: 'Event too large' }, { status: 413 })
  try {
    let payload: RecordStorefrontEventInput
    const contentType = request.headers.get('content-type') ?? ''

    if (contentType.includes('application/json') || contentType.includes('text/plain')) {
      const text = await request.text()
      if (text.length > MAX_EVENT_BYTES) return NextResponse.json({ error: 'Event too large' }, { status: 413 })
      payload = JSON.parse(text) as RecordStorefrontEventInput
    } else {
      payload = (await request.json()) as RecordStorefrontEventInput
    }

    const userAgent = request.headers.get('user-agent') ?? undefined
    const result = await recordStorefrontEventAction(payload, userAgent)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, eventId: result.data.eventId }, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid event format'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
