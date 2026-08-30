/**
 * Public Checkout Session Creation API Endpoint (Slice 5 §5.6).
 *
 * Accepts checkout payloads, executes server pricing validation & tax calculations,
 * initializes order state, and returns checkout session ID and redirect URL.
 */
import { NextResponse, type NextRequest } from 'next/server'

import {
  type CreateCheckoutSessionActionInput,
  createCheckoutSessionAction,
} from '../../../../lib/checkout-actions'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json()) as CreateCheckoutSessionActionInput
    const result = await createCheckoutSessionAction(payload)

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 400 },
      )
    }

    return NextResponse.json(result.data, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid checkout request'
    return NextResponse.json({ error: message, code: 'INVALID_REQUEST' }, { status: 400 })
  }
}
