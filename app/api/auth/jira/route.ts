import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { generatePKCE, buildAuthorizationUrl } from '@/lib/jira/oauth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { verifier, challenge } = generatePKCE()
  const state = crypto.randomBytes(16).toString('hex')

  const cookieStore = await cookies()

  // Store verifier + state in short-lived httpOnly cookies for the callback to verify
  cookieStore.set('jira_pkce_verifier', verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  cookieStore.set('jira_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const url = buildAuthorizationUrl(challenge, state)

  return NextResponse.json({ url })
}
