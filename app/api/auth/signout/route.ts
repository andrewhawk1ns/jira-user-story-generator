import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/signout
 *
 * Clears the long-lived sg_uid cookie so the silent-refresh path on the
 * login page cannot re-authenticate the user after an explicit sign-out.
 * The caller is responsible for also clearing the Supabase session via
 * supabase.auth.signOut() on the client.
 */
export async function POST() {
  const response = NextResponse.json({ success: true })

  response.cookies.set('sg_uid', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  return response
}
