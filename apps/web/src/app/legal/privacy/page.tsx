import type { Metadata } from 'next'

import { ContactLine, LegalPage, legalEntity } from '@/components/site/LegalPage'

export const metadata: Metadata = { title: 'Privacy policy' }

export default function PrivacyPage() {
  const { name } = legalEntity()
  return (
    <LegalPage title="Privacy policy" updated="2 October 2026">
      <p>
        This explains what {name} collects, why, and what you can do about it. We follow
        India&rsquo;s Digital Personal Data Protection Act, 2023.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details</strong>: your name, email, and password (stored only as a one-way
          hash), and passkeys if you add them.
        </li>
        <li>
          <strong>Store and sales records</strong>: products, files, orders, refunds, and the ledger
          that records every rupee.
        </li>
        <li>
          <strong>Buyer details</strong> needed to deliver a purchase: name, email, optional phone,
          state for GST, and a GSTIN if the buyer gives one. Card and UPI details go straight to
          Razorpay; we never see or store them.
        </li>
        <li>
          <strong>Payout details</strong>: the bank account or UPI ID you add, to send your
          earnings.
        </li>
        <li>
          <strong>Usage</strong>: store visits, with IP addresses stored only as salted hashes, and
          which pages led to a sale.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <p>
        To run your store, take payments, deliver files, calculate tax, pay creators and affiliates,
        prevent fraud, and meet legal and tax obligations. We do not sell personal data, and we do
        not use it for advertising.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li>The creator you bought from, who needs your details to serve you.</li>
        <li>Razorpay, to process payments and refunds.</li>
        <li>Our email provider, to send receipts and account emails.</li>
        <li>Our hosting and storage providers, who store data on our behalf.</li>
        <li>Anthropic, only the text you choose to send to the AI copilot.</li>
        <li>Authorities, when the law requires it.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Account data for as long as your account is open. Order and ledger records for eight years,
        because Indian tax law requires it. Audit records for security for up to two years.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct, or delete your personal data, or withdraw consent. Records we
        must keep by law stay until that period ends. Write to <ContactLine /> and we will reply
        within 30 days.
      </p>

      <h2>Cookies</h2>
      <p>
        We use a sign-in cookie, a cookie that remembers your theme, and on stores a cookie that
        remembers which affiliate link you arrived from for up to 30 days. We do not use advertising
        cookies.
      </p>
    </LegalPage>
  )
}
