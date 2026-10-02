import type { Metadata } from 'next'

import { ContactLine, LegalPage, legalEntity } from '@/components/site/LegalPage'

export const metadata: Metadata = { title: 'Terms of service' }

export default function TermsPage() {
  const { name } = legalEntity()
  return (
    <LegalPage title="Terms of service" updated="2 October 2026">
      <p>
        These terms are the agreement between you and {name} (&ldquo;CreatorHub&rdquo;,
        &ldquo;we&rdquo;) when you use CreatorHub to sell, or buy from a store that runs on it. If
        you do not agree to them, do not use the service.
      </p>

      <h2>Who is who</h2>
      <ul>
        <li>
          <strong>Creators</strong> open a store on CreatorHub and sell their own digital products.
          The creator is the seller of every product on their store and is responsible for it.
        </li>
        <li>
          <strong>Buyers</strong> buy from a creator&rsquo;s store. Your purchase contract is with
          the creator.
        </li>
        <li>
          <strong>Affiliates</strong> are invited by a creator to refer buyers in return for a
          commission.
        </li>
      </ul>

      <h2>Your account</h2>
      <p>
        Keep your password private and your email address current; we use it to confirm payouts and
        to reach you about your account. You are responsible for what happens under your account,
        including anything done by team members you invite.
      </p>

      <h2>What creators may sell</h2>
      <p>
        Only digital products you own or have the right to sell. You may not sell anything unlawful
        in India, anything that infringes someone else&rsquo;s rights, malware, or material that
        sexualises minors. We may remove a product, pause a store, or close an account that breaks
        these rules, and we will tell you why unless the law prevents us.
      </p>

      <h2>Fees and payouts</h2>
      <ul>
        <li>
          We keep the platform fee of your plan on each paid sale (5% on Starter). There is no fee
          on free products.
        </li>
        <li>Payments are processed by Razorpay, which charges its own processing fee.</li>
        <li>
          Your balance is your sales after refunds, tax collected, affiliate commission, and fees.
          You can withdraw it to an account in your name once it reaches ₹500. We may hold a payout
          while we check unusual activity.
        </li>
        <li>
          If you are registered for GST, you are responsible for filing and paying the tax collected
          on your sales.
        </li>
      </ul>

      <h2>Refunds and disputes</h2>
      <p>
        Creators set their own refund terms, within our{' '}
        <a href="/legal/refunds" className="text-accent underline underline-offset-2">
          refund policy
        </a>
        . A refund or a chargeback is deducted from the creator&rsquo;s balance, and any affiliate
        commission on it is reversed.
      </p>

      <h2>Affiliates</h2>
      <p>
        Commission is earned on a sale made through your link within the store&rsquo;s cookie
        window, is held for 30 days, and is reversed if the sale is refunded. You may not buy
        through your own link or use misleading ads, spam, or bid on a creator&rsquo;s name without
        their permission.
      </p>

      <h2>The service</h2>
      <p>
        We work to keep CreatorHub available and your data safe, but we provide it as is. To the
        extent the law allows, our total liability to you for any claim is limited to the fees you
        paid us in the three months before it arose.
      </p>

      <h2>Changes and ending</h2>
      <p>
        We may change these terms; we will email creators at least 14 days before a change that
        affects them takes effect. You can close your account at any time; we pay out your remaining
        balance after any open refund window has passed.
      </p>

      <h2>Law</h2>
      <p>
        These terms are governed by the laws of India. Courts in India have jurisdiction over any
        dispute.
      </p>

      <p>
        Questions: <ContactLine />.
      </p>
    </LegalPage>
  )
}
