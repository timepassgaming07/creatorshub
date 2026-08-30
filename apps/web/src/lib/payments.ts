/**
 * Payment Provider Singleton for the Web Application (Slice 5 §5.1, §5.6).
 *
 * Responsibilities:
 * - Provide singleton access to the configured `PaymentProvider` instance.
 * - Defaults to `MemoryPaymentProvider` in test/development environments.
 */
import { MemoryPaymentProvider, type PaymentProvider } from '@creatorhub/payments'

const globalForPayments = globalThis as unknown as {
  paymentProvider?: PaymentProvider
}

export function getPaymentProvider(): PaymentProvider {
  globalForPayments.paymentProvider ??= new MemoryPaymentProvider()
  return globalForPayments.paymentProvider
}
