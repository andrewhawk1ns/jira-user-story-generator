import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/layout/AppHeader'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
    </div>
  )
}
