/**
 * Payment Provider Singleton for the Web Application (Slice 5 §5.1, §5.6, §5.8).
 *
 * Responsibilities:
 * - Provide singleton access to the configured `PaymentProvider` instance.
 * - Supports `RazorpayPaymentProvider` (ADR-0016) and `MemoryPaymentProvider`.
 */
import {
  MemoryPaymentProvider,
  RazorpayPaymentProvider,
  type PaymentProvider,
} from '@creatorhub/payments'

const globalForPayments = globalThis as unknown as {
  paymentProvider?: PaymentProvider
}

export function getPaymentProvider(): PaymentProvider {
  if (!globalForPayments.paymentProvider) {
    const providerName = process.env['PAYMENT_PROVIDER'] ?? 'memory'
    if (providerName === 'razorpay') {
      globalForPayments.paymentProvider = new RazorpayPaymentProvider({
        keyId: process.env['RAZORPAY_KEY_ID'],
        keySecret: process.env['RAZORPAY_KEY_SECRET'],
      })
    } else {
      globalForPayments.paymentProvider = new MemoryPaymentProvider()
    }
  }
  return globalForPayments.paymentProvider
}
