/**
 * Subdomain Branded Storefront Checkout Route (Slice 5 §5.11).
 * Route: /s/[subdomain]/checkout?productId=...
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicCheckoutProductData } from '@/lib/checkout-actions'
import { CheckoutForm } from '@/components/checkout/CheckoutForm'
import { StorefrontThemeProvider } from '@/components/storefront/StorefrontThemeProvider'

export const metadata: Metadata = {
  title: 'Secure Checkout · Creator Store',
  description: 'Complete your purchase.',
  robots: { index: false, follow: false },
}

type SubdomainCheckoutPageProps = {
  readonly params: Promise<{ readonly subdomain: string }>
  readonly searchParams: Promise<{
    readonly productId?: string
    readonly discount?: string
  }>
}

export default async function SubdomainCheckoutPage({
  params,
  searchParams,
}: SubdomainCheckoutPageProps) {
  const { subdomain } = await params
  const sParams = await searchParams
  const productId = sParams.productId

  if (!productId) {
    notFound()
  }

  const result = await getPublicCheckoutProductData({
    productId,
    subdomain,
  })

  if (!result.ok) {
    notFound()
  }

  const data = result.data

  return (
    <StorefrontThemeProvider theme={data.storefront.themeConfig}>
      <div className="min-h-screen bg-slate-50/50 py-6 sm:py-10">
        <CheckoutForm checkoutData={data} initialDiscountCode={sParams.discount ?? ''} />
      </div>
    </StorefrontThemeProvider>
  )
}
