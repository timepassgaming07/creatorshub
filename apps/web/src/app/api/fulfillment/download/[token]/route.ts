/**
 * GET /api/fulfillment/download/[token]
 *
 * Consumes one download from the grant and redirects to a storage URL that
 * expires in five minutes. The redirect target is a signed bucket URL (S3/R2)
 * or the signed local storage route; either way the long-lived token never
 * reaches the storage layer.
 */
import { NextResponse, type NextRequest } from 'next/server'

import { consumeDownload } from '@/lib/fulfillment-actions'

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  EXPIRED: 410,
  EXHAUSTED: 429,
  REVOKED: 403,
  UNAVAILABLE: 409,
  ERROR: 500,
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await props.params

  const result = await consumeDownload(token, {
    ipAddress:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  })

  if (!result.ok) {
    // A browser following the download button lands back on the download
    // page, which explains what happened in words rather than JSON.
    const accept = request.headers.get('accept') ?? ''
    if (accept.includes('text/html')) {
      const back = new URL(`/fulfillment/${encodeURIComponent(token)}`, request.url)
      back.searchParams.set('error', result.error.code)
      return NextResponse.redirect(back, 303)
    }
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: STATUS[result.error.code] ?? 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.redirect(result.data.downloadUrl, {
    status: 303,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
}
