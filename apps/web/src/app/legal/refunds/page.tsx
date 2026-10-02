import type { Metadata } from 'next'

import { ContactLine, LegalPage } from '@/components/site/LegalPage'

export const metadata: Metadata = { title: 'Refund policy' }

export default function RefundsPage() {
  return (
    <LegalPage title="Refund policy" updated="2 October 2026">
      <p>
        Products on CreatorHub are digital and delivered instantly, so refunds work a little
        differently from physical goods.
      </p>

      <h2>For buyers</h2>
      <ul>
        <li>
          Ask the creator first. Reply to your receipt email, or use the contact links on their
          store. Creators can refund any order in full or in part from their dashboard.
        </li>
        <li>
          If a file does not download, is not what the product page described, or you were charged
          twice, and the creator has not answered within 7 days, write to <ContactLine /> with your
          order number. We will look into it and can refund you directly.
        </li>
        <li>
          Refunds go back to the payment method you used. Banks usually take 5 to 7 working days to
          show it.
        </li>
        <li>A full refund ends access to the files.</li>
      </ul>

      <h2>For creators</h2>
      <ul>
        <li>
          Refunds are taken from your balance. GST and our fee on the refunded amount are reversed.
        </li>
        <li>Affiliate commission on a refunded sale is reversed automatically.</li>
        <li>
          If a refund leaves your balance negative, it is recovered from your next sales before any
          payout.
        </li>
      </ul>
    </LegalPage>
  )
}
