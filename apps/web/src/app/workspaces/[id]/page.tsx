import type { Metadata } from 'next'

import { HomeView } from '@/components/dashboard/HomeView'
import { loadHome } from '@/lib/dashboard-data'
import { getServerSession } from '@/lib/server-session'

export const metadata: Metadata = { title: 'Home' }

export default async function WorkspaceHomePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>
  readonly searchParams: Promise<{ welcome?: string }>
}) {
  const { id } = await params
  const { welcome } = await searchParams
  const [data, session] = await Promise.all([loadHome(id), getServerSession()])
  return <HomeView data={data} firstName={(session?.user.name ?? '').split(' ')[0] ?? ''} welcome={welcome === '1'} />
}
