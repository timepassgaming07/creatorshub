/**
 * Payment provider for the web app (ADR-0007, ADR-0016).
 *
 * `PAYMENT_PROVIDER=razorpay` with RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in
 * production. The memory provider takes no money; it exists for development
 * and the end-to-end suite and is refused anywhere else (see env.ts).
 */
import {
  MemoryPaymentProvider,
  RazorpayPaymentProvider,
  type PaymentProvider,
} from '@creatorhub/payments'

import { allowsTestAdapters, ConfigurationError, envValue } from './env'

const globalForPayments = globalThis as unknown as {
  paymentProvider?: PaymentProvider
}

export function getPaymentProvider(): PaymentProvider {
  if (globalForPayments.paymentProvider) return globalForPayments.paymentProvider

  const configured = envValue('PAYMENT_PROVIDER') ?? (allowsTestAdapters() ? 'memory' : 'razorpay')
  let provider: PaymentProvider

  if (configured === 'razorpay') {
    provider = new RazorpayPaymentProvider({
      keyId: envValue('RAZORPAY_KEY_ID') ?? '',
      keySecret: envValue('RAZORPAY_KEY_SECRET') ?? '',
    })
  } else if (configured === 'memory') {
    if (!allowsTestAdapters()) {
      throw new ConfigurationError(
        'PAYMENT_PROVIDER=memory takes no real payments and is disabled in production. Configure Razorpay.',
      )
    }
    provider = new MemoryPaymentProvider()
  } else {
    throw new ConfigurationError(`Unknown PAYMENT_PROVIDER "${configured}".`)
  }

  globalForPayments.paymentProvider = provider
  return provider
}

/** True when checkout is running against the memory provider. Shown to buyers. */
export function isTestPaymentMode(): boolean {
  return getPaymentProvider().name === 'memory'
}
