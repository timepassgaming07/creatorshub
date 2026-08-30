/**
 * Universal Checkout Route (Slice 5 §5.11).
 * Route: /checkout?productId=...&storefrontId=...&discount=...
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicCheckoutProductData } from '@/lib/checkout-actions'
import { CheckoutForm } from '@/components/checkout/CheckoutForm'
import { StorefrontThemeProvider } from '@/components/storefront/StorefrontThemeProvider'

export const metadata: Metadata = {
  title: 'Checkout · Secure Order',
  description: 'Complete your purchase securely.',
  robots: { index: false, follow: false },
}

type CheckoutPageProps = {
  readonly searchParams: Promise<{
    readonly productId?: string
    readonly storefrontId?: string
    readonly workspaceId?: string
    readonly subdomain?: string
    readonly customDomain?: string
    readonly discount?: string
  }>
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams
  const productId = params.productId

  if (!productId) {
    notFound()
  }

  const result = await getPublicCheckoutProductData({
    productId,
    storefrontId: params.storefrontId,
    workspaceId: params.workspaceId,
    subdomain: params.subdomain,
    customDomain: params.customDomain,
  })

  if (!result.ok) {
    notFound()
  }

  const data = result.data

  return (
    <StorefrontThemeProvider theme={data.storefront.themeConfig}>
      <div className="min-h-screen bg-slate-50/50 py-6 sm:py-10">
        <CheckoutForm checkoutData={data} initialDiscountCode={params.discount ?? ''} />
      </div>
    </StorefrontThemeProvider>
  )
}
