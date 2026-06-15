'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function AppHeader() {
  const router = useRouter()
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = createClient()
    await Promise.all([
      supabase.auth.signOut(),
      fetch('/api/auth/signout', { method: 'POST' }),
    ])
    router.push('/')
  }

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        <Link href="/sessions" className="text-sm font-semibold">
          SpecKit
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/sessions"
            className={pathname?.startsWith('/sessions') ? 'font-medium' : 'text-muted-foreground'}
          >
            Sessions
          </Link>
          <Link
            href="/profile"
            className={pathname === '/profile' ? 'font-medium' : 'text-muted-foreground'}
          >
            Profile
          </Link>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  )
}
