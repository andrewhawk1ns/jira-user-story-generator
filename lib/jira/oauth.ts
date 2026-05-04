/**
 * lib/jira/oauth.ts — server-only
 *
 * Handles Jira OAuth 2.0 3LO (PKCE):
 * - PKCE verifier/challenge generation
 * - Authorization URL construction
 * - Token exchange (code → access_token + refresh_token)
 * - Token refresh
 * - AES-256-GCM encryption/decryption of tokens at rest
 */
import crypto from 'crypto'
import {
  jiraTokenResponseSchema,
  jiraAccessibleResourceSchema,
  jiraMyselfSchema,
} from '../schemas/jira'
import type { JiraMyself } from '../schemas/jira'

// ── PKCE ─────────────────────────────────────────────────────────────────────

export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function buildAuthorizationUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.JIRA_CLIENT_ID!,
    scope: 'read:me read:jira-user read:jira-work write:jira-work offline_access',
    redirect_uri: process.env.JIRA_REDIRECT_URI!,
    state,
    response_type: 'code',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `https://auth.atlassian.com/authorize?${params.toString()}`
}

// ── Token exchange ────────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(
  code: string,
  verifier: string
): Promise<{
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
  scopes: string[]
}> {
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.JIRA_CLIENT_ID!,
      client_secret: process.env.JIRA_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.JIRA_REDIRECT_URI!,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Jira token exchange failed: ${response.status} ${body}`)
  }

  const raw = await response.json()
  const parsed = jiraTokenResponseSchema.parse(raw)

  const expiresAt = new Date(Date.now() + parsed.expires_in * 1000)
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresAt,
    scopes: parsed.scope.split(' '),
  }
}

export async function refreshAccessToken(encryptedRefreshToken: string): Promise<{
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
  scopes: string[]
}> {
  const refreshToken = decrypt(encryptedRefreshToken)

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.JIRA_CLIENT_ID!,
      client_secret: process.env.JIRA_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Jira token refresh failed: ${response.status} ${body}`)
  }

  const raw = await response.json()
  const parsed = jiraTokenResponseSchema.parse(raw)
  const expiresAt = new Date(Date.now() + parsed.expires_in * 1000)

  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresAt,
    scopes: parsed.scope.split(' '),
  }
}

// ── Cloud instance discovery ──────────────────────────────────────────────────

export async function getAccessibleResources(
  accessToken: string
): Promise<{ cloudId: string; baseUrl: string }> {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Jira accessible resources: ${response.status}`)
  }

  const raw = await response.json()
  const resources = jiraAccessibleResourceSchema.array().parse(raw)

  if (resources.length === 0) {
    throw new Error('No accessible Jira cloud instances found for this account')
  }

  // Use the first accessible resource (most accounts have one cloud instance)
  const resource = resources[0]
  return { cloudId: resource.id, baseUrl: resource.url }
}

// ── Current user identity ───────────────────────────────────────────────────

/**
 * Fetches the Atlassian user identity using the access token directly.
 * Use this during the OAuth callback before tokens are persisted to the DB.
 */
export async function getMyselfFromToken(accessToken: string): Promise<JiraMyself> {
  const response = await fetch('https://api.atlassian.com/me', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Atlassian user profile: ${response.status}`)
  }

  const raw = await response.json()
  // Atlassian Identity API (/me) uses snake_case; map to our camelCase schema
  return jiraMyselfSchema.parse({
    accountId: raw.account_id,
    displayName: raw.name,
    emailAddress: raw.email,
  })
}

// ── AES-256-GCM Encryption ────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // bytes

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY env var is not set')
  const buf = Buffer.from(key, 'base64')
  if (buf.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 encoded)')
  return buf
}

/** Returns "iv:ciphertext:authtag" as a base64-encoded string */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

/** Decrypts a value produced by encrypt() */
export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64')
  const key = getKey()
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16)
  const encrypted = buf.subarray(IV_LENGTH + 16)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
