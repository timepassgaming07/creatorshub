import type { Metadata } from 'next'

import { SignUpForm } from './SignUpForm'

export const metadata: Metadata = {
  title: 'Create your store',
  description: 'Start selling digital products from one link. Free to start, you pay only when you sell.',
}

export default function SignUpPage() {
  return <SignUpForm />
}
