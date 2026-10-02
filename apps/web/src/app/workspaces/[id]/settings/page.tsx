import type { Metadata } from 'next'

import { SettingsView } from '@/components/settings/SettingsView'
import { loadSettings } from '@/lib/dashboard-data'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadSettings(id)
  return <SettingsView data={data} />
}
