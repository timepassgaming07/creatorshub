import type { Metadata } from 'next'

import { LegalPage, legalEntity } from '@/components/site/LegalPage'

export const metadata: Metadata = { title: 'Contact' }

export default function ContactPage() {
  const { name, email, address } = legalEntity()
  return (
    <LegalPage title="Contact" updated="2 October 2026">
      <p>
        <strong>If you bought something</strong>, the creator is the best person to help: reply to
        your receipt email. If they have not answered within 7 days, write to us with your order
        number.
      </p>
      <p>
        <strong>If you sell on CreatorHub</strong>, write to us from the email address on your
        account so we can find it quickly.
      </p>
      <h2>Reach us</h2>
      {email ? (
        <p>
          Email{' '}
          <a href={`mailto:${email}`} className="font-medium text-accent hover:underline">
            {email}
          </a>
          . We reply within two working days.
        </p>
      ) : (
        <p>
          Our support inbox is being set up. Sellers can reach us from the dashboard in the
          meantime.
        </p>
      )}
      <p>
        {name}
        {address ? (
          <>
            <br />
            {address}
          </>
        ) : null}
      </p>
      <h2>Grievance officer</h2>
      <p>
        Under India&rsquo;s IT Rules, complaints about content or personal data can be sent to our
        grievance officer at the address above. We acknowledge within 24 hours and resolve within 15
        days.
      </p>
    </LegalPage>
  )
}
