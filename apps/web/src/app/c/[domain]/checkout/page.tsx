/**
 * Custom Domain Branded Storefront Checkout Route (Slice 5 §5.11).
 * Route: /c/[domain]/checkout?productId=...
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicCheckoutProductData } from '@/lib/checkout-actions'
import { CheckoutForm } from '@/components/checkout/CheckoutForm'
import { StorefrontThemeProvider } from '@/components/storefront/StorefrontThemeProvider'

export const metadata: Metadata = {
  title: 'Secure Checkout · Store',
  description: 'Complete your purchase.',
  robots: { index: false, follow: false },
}

type CustomDomainCheckoutPageProps = {
  readonly params: Promise<{ readonly domain: string }>
  readonly searchParams: Promise<{
    readonly productId?: string
    readonly discount?: string
  }>
}

export default async function CustomDomainCheckoutPage({
  params,
  searchParams,
}: CustomDomainCheckoutPageProps) {
  const { domain } = await params
  const sParams = await searchParams
  const productId = sParams.productId

  if (!productId) {
    notFound()
  }

  const result = await getPublicCheckoutProductData({
    productId,
    customDomain: domain,
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
