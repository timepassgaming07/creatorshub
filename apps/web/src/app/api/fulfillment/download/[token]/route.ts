/**
 * Digital Asset Download API Route (Slice 6 §6.4).
 *
 * GET /api/fulfillment/download/[token]
 *
 * Responsibilities:
 * 1. Hashes token with SHA-256 and validates active entitlement, use cap, and expiration.
 * 2. Increments download count and records download audit event with hashed IP and User-Agent.
 * 3. Returns presigned S3/R2 redirect or streams object bytes directly with Content-Disposition headers.
 */
import { NextResponse, type NextRequest } from 'next/server'

import { consumeDownloadAction } from '../../../../../lib/fulfillment-actions'
import { getStorageDriver } from '../../../../../lib/storage'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await props.params

  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  const userAgent = request.headers.get('user-agent') ?? 'unknown'

  const result = await consumeDownloadAction(token, {
    ipAddress,
    userAgent,
  })

  if (!result.ok) {
    const status =
      result.error.code === 'NOT_FOUND'
        ? 404
        : result.error.code === 'EXPIRED' ||
            result.error.code === 'EXHAUSTED' ||
            result.error.code === 'REVOKED'
          ? 403
          : 500

    return NextResponse.json(
      {
        error: result.error.message,
        code: result.error.code,
      },
      { status },
    )
  }

  const { downloadUrl, storageKey, originalFilename, mimeType, byteSize } = result.data

  // If storage driver provided a presigned direct URL (e.g. AWS S3 / Cloudflare R2), redirect
  if (downloadUrl) {
    return NextResponse.redirect(downloadUrl, 307)
  }

  // Fallback / In-Memory storage: Stream object directly from storage driver
  try {
    const storageDriver = getStorageDriver()
    const obj = await storageDriver.getObject(storageKey)

    if (!obj) {
      return NextResponse.json(
        { error: 'Asset file not found in storage', code: 'NOT_FOUND' },
        { status: 404 },
      )
    }

    return new Response(obj.data as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
        'Content-Length': byteSize,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(originalFilename)}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve asset stream'
    return NextResponse.json({ error: message, code: 'STREAM_ERROR' }, { status: 500 })
  }
}
