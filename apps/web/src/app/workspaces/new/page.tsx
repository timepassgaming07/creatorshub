import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { platformRootDomain } from '@/lib/env'
import { getServerSession } from '@/lib/server-session'

import { CreateStoreForm } from './CreateStoreForm'

export const metadata: Metadata = { title: 'Create your store', robots: { index: false } }

export default async function NewWorkspacePage() {
  const session = await getServerSession()
  if (!session) redirect('/sign-in?redirect=/workspaces/new')

  const root = platformRootDomain()
  return (
    <CreateStoreForm
      creatorName={session.user.name ?? ''}
      addressSuffix={root === 'localhost' ? null : `.${root}`}
    />
  )
}
