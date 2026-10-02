/**
 * Signed object storage endpoint for the local storage driver.
 *
 * PUT  /api/storage?op=put&key=…&expires=…&ct=…&len=…&sig=…  — upload bytes
 * GET  /api/storage?op=get&key=…&expires=…&fn=…&sig=…         — download bytes
 *
 * Only URLs the driver itself issued verify: the signature covers the key, the
 * expiry, and for uploads the exact content type and length. With S3 or R2
 * configured the browser talks to the bucket directly and this route answers
 * 404 for everything.
 */
import { NextResponse, type NextRequest } from 'next/server'

import { getLocalStorageDriver } from '@/lib/storage'

/** Uploads above this are refused before reading the body. Matches the asset limit. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024

function signedRequest(request: NextRequest, op: 'put' | 'get') {
  const q = request.nextUrl.searchParams
  return {
    op,
    key: q.get('key') ?? '',
    expires: Number(q.get('expires') ?? '0'),
    contentType: q.get('ct') ?? undefined,
    contentLength: q.get('len') ?? undefined,
    filename: q.get('fn') ?? undefined,
    signature: q.get('sig') ?? '',
  }
}

function problem(status: number, title: string, detail: string): NextResponse {
  return NextResponse.json({ title, detail }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest): Promise<Response> {
  const driver = getLocalStorageDriver()
  if (!driver) return problem(404, 'Not found', 'Direct uploads go to the configured bucket.')

  const signed = signedRequest(request, 'put')
  if (request.nextUrl.searchParams.get('op') !== 'put' || !driver.verify(signed)) {
    return problem(403, 'Upload link not valid', 'This upload link has expired or was altered. Start the upload again.')
  }

  const declared = Number(signed.contentLength)
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_UPLOAD_BYTES) {
    return problem(413, 'File too large', 'Files up to 2 GB can be uploaded.')
  }

  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim()
  if (!contentType || contentType !== signed.contentType) {
    return problem(400, 'Unexpected file type', 'The file type does not match the upload that was requested.')
  }

  const body = new Uint8Array(await request.arrayBuffer())
  if (body.byteLength !== declared) {
    return problem(400, 'Upload incomplete', 'The file size does not match. Try the upload again.')
  }

  await driver.putObject(signed.key, body, { contentType })
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}

/** Parse a single `bytes=start-end` range. Multi-range requests get the whole file. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart = '', rawEnd = ''] = match
  if (rawStart === '' && rawEnd === '') return null
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(rawStart)
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  return start <= end && start < size ? { start, end } : null
}

function contentDisposition(filename: string): string {
  // ASCII fallback plus RFC 5987 for the real name, so non-Latin filenames survive.
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', "'")
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function GET(request: NextRequest): Promise<Response> {
  const driver = getLocalStorageDriver()
  if (!driver) return problem(404, 'Not found', 'Files are served from the configured bucket.')

  const signed = signedRequest(request, 'get')
  if (request.nextUrl.searchParams.get('op') !== 'get' || !driver.verify(signed)) {
    return problem(403, 'Download link not valid', 'This link has expired. Go back to your download page and start the download again.')
  }

  const object = await driver.getObject(signed.key)
  if (!object) return problem(404, 'File not found', 'This file is no longer available. Contact the seller.')

  const size = object.data.byteLength
  const headers: Record<string, string> = {
    'Content-Type': object.metadata.contentType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': contentDisposition(signed.filename ?? signed.key.split('/').pop() ?? 'download'),
  }

  const range = parseRange(request.headers.get('range'), size)
  if (request.headers.get('range') && !range) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${String(size)}` } })
  }

  if (range) {
    const chunk = new Uint8Array(object.data.subarray(range.start, range.end + 1))
    return new Response(chunk, {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`,
      },
    })
  }

  return new Response(new Uint8Array(object.data), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(size) },
  })
}
