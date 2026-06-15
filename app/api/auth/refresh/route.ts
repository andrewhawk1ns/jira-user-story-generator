import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { refreshAccessToken, encrypt } from '@/lib/jira/oauth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/refresh
 *
 * Attempts a silent re-authentication for returning users:
 * 1. Reads the `sg_uid` long-lived cookie set after the initial OAuth login.
 * 2. Looks up the user's stored (encrypted) Jira refresh token.
 * 3. Exchanges it for a fresh access token at Atlassian.
 * 4. Updates `jira_tokens` with the new token data.
 * 5. Re-establishes a Supabase session via the magic-link/OTP trick.
 * 6. Sets Supabase session cookies and returns 200.
 *
 * Returns 401 if any step fails so the caller can fall back to full OAuth.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const uid = cookieStore.get('sg_uid')?.value

  if (!uid) {
    return NextResponse.json({ success: false, reason: 'no_uid_cookie' }, { status: 401 })
  }

  try {
    const serviceClient = createServiceClient()

    const { data: tokenRow, error: tokenError } = await serviceClient
      .from('jira_tokens')
      .select('encrypted_refresh_token, token_expires_at')
      .eq('id', uid)
      .single()

    if (tokenError || !tokenRow?.encrypted_refresh_token) {
      return NextResponse.json({ success: false, reason: 'no_refresh_token' }, { status: 401 })
    }

    const { accessToken, refreshToken, expiresAt, scopes } = await refreshAccessToken(
      tokenRow.encrypted_refresh_token
    )

    await serviceClient.from('jira_tokens').update({
      encrypted_access_token: encrypt(accessToken),
      ...(refreshToken ? { encrypted_refresh_token: encrypt(refreshToken) } : {}),
      token_expires_at: expiresAt.toISOString(),
      scopes,
    }).eq('id', uid)

    // Re-establish Supabase session using the magic-link OTP trick
    const adminClient = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: userRecord, error: userError } = await adminClient.auth.admin.getUserById(uid)
    if (userError || !userRecord.user?.email) {
      return NextResponse.json({ success: false, reason: 'user_not_found' }, { status: 401 })
    }

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: userRecord.user.email,
    })
    if (linkError || !linkData.properties?.hashed_token) {
      return NextResponse.json({ success: false, reason: 'link_failed' }, { status: 401 })
    }

    const { data: verifyData, error: verifyError } = await adminClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })
    if (verifyError || !verifyData.session) {
      return NextResponse.json({ success: false, reason: 'verify_failed' }, { status: 401 })
    }

    const response = NextResponse.json({ success: true })

    const ssrClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    await ssrClient.auth.setSession({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    })

    return response
  } catch (err) {
    console.error('[auth/refresh]', err)
    return NextResponse.json({ success: false, reason: 'internal_error' }, { status: 401 })
  }
}
