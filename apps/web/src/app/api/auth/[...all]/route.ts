import type { NextRequest } from 'next/server'

import { getAuth } from '@/lib/auth'

export async function GET(request: NextRequest): Promise<Response> {
  return getAuth().handler(request)
}

export async function POST(request: NextRequest): Promise<Response> {
  return getAuth().handler(request)
}
