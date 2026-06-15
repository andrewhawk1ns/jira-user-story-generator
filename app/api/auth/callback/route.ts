import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import {
  exchangeCodeForTokens,
  getAccessibleResources,
  getMyselfFromToken,
  encrypt,
} from '@/lib/jira/oauth'
import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const base = process.env.NEXTJS_BASE_URL ?? 'http://localhost:3000'

  if (errorParam) {
    return NextResponse.redirect(`${base}/?error=${encodeURIComponent(errorParam)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${base}/?error=missing_params`)
  }

  const cookieStore = await cookies()
  const storedVerifier = cookieStore.get('jira_pkce_verifier')?.value
  const storedState = cookieStore.get('jira_oauth_state')?.value

  if (!storedVerifier || !storedState || storedState !== state) {
    return NextResponse.redirect(`${base}/?error=invalid_state`)
  }

  // Clear PKCE cookies
  cookieStore.delete('jira_pkce_verifier')
  cookieStore.delete('jira_oauth_state')

  try {
    // Exchange code for tokens
    const { accessToken, refreshToken, expiresAt, scopes } = await exchangeCodeForTokens(
      code,
      storedVerifier
    )

    // Get Jira cloud instance
    const { cloudId, baseUrl } = await getAccessibleResources(accessToken)

    // Get Atlassian user info using the access token directly (tokens not yet in DB)
    const myself = await getMyselfFromToken(accessToken)

    // Sign in or create Supabase user via service role (email = Atlassian accountId@atlassian.local)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Use accountId as a stable unique email-like identifier
    const email = `${myself.accountId}@atlassian.local`

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        jira_account_id: myself.accountId,
        jira_display_name: myself.displayName,
      },
    })

    let userId: string

    if (authError && authError.message.includes('already been registered')) {
      // User exists — look them up
      const { data: listData } = await adminClient.auth.admin.listUsers()
      const existing = listData?.users.find((u) => u.email === email)
      if (!existing) throw new Error('Could not find existing user')
      userId = existing.id
    } else if (authError) {
      throw authError
    } else {
      userId = authData.user.id
    }

    const serviceClient = createServiceClient()

    // Upsert Jira tokens (encrypted)
    const { error: tokenUpsertError } = await serviceClient.from('jira_tokens').upsert({
      id: userId,
      encrypted_access_token: encrypt(accessToken),
      encrypted_refresh_token: refreshToken ? encrypt(refreshToken) : null,
      token_expires_at: expiresAt.toISOString(),
      scopes,
      jira_cloud_id: cloudId,
      jira_base_url: baseUrl,
    })
    if (tokenUpsertError) throw tokenUpsertError

    // Upsert user profile
    const { error: profileUpsertError } = await serviceClient.from('user_profiles').upsert({
      id: userId,
      jira_account_id: myself.accountId,
      jira_display_name: myself.displayName,
    })
    if (profileUpsertError) throw profileUpsertError

    // Create a session for the user so the browser is authenticated
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (linkError || !linkData.properties?.hashed_token) {
      throw linkError ?? new Error('Failed to generate session link')
    }

    // Verify the magic link server-side using the hashed token form
    const { data: verifyData, error: verifyError } = await adminClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })

    if (verifyError || !verifyData.session) {
      throw verifyError ?? new Error('Failed to verify session')
    }

    // Build the redirect response and set session cookies via @supabase/ssr so
    // createClient() on subsequent requests recognises the session correctly.
    const response = NextResponse.redirect(`${base}/`)

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

    // Persist a long-lived identity cookie so silent refresh can work
    // after the Supabase session expires. The value is just the Supabase
    // user UUID — not a credential on its own.
    response.cookies.set('sg_uid', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })

    return response

  } catch (err) {
    console.error('[auth/callback]', err)
    return NextResponse.redirect(`${base}/?error=auth_failed`)
  }
}
