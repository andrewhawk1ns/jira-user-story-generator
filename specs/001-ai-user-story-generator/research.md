# Research: AI User Story Generator

**Branch**: `001-ai-user-story-generator` | **Date**: 2026-05-03

---

## 1. Jira OAuth 2.0 (3-Legged) — Scopes and Flow

**Decision**: Use Atlassian OAuth 2.0 (3LO) with the following minimum scopes:
- `read:me` — identify the authenticated user
- `read:jira-user` — read user profile
- `read:jira-work` — read projects, epics, sprints, and issues
- `write:jira-work` — create issues
- `offline_access` — obtain a refresh token for silent re-authentication

**Rationale**: The `offline_access` scope is required to get a refresh token, allowing the app to silently refresh expired access tokens without forcing re-login during an active session. Without it, tokens expire in ~1 hour and interrupt the user mid-workflow.

**Flow**:
1. User visits `/api/auth/jira` → server generates a PKCE code verifier/challenge, stores verifier in an encrypted cookie, redirects to Atlassian authorization URL.
2. Atlassian redirects to `/api/auth/callback` with `code` + `state`.
3. Server exchanges code + verifier for `access_token` + `refresh_token` using the Atlassian token endpoint.
4. Tokens are encrypted (AES-256-GCM) and stored in the `jira_tokens` Supabase table, associated with the authenticated user session.
5. A Supabase session cookie is set via `@supabase/ssr` to identify the user on subsequent requests.

**Alternatives considered**: API token (basic auth) — rejected because it requires the user to manually create and paste a token, does not support delegated access granularity, and violates the constitution's OAuth requirement.

---

## 2. Audio Transcription Strategy

**Decision**: Record audio in the browser using the MediaRecorder Web API (WebM/Opus format), upload the blob to Supabase Storage (private bucket, user-scoped path), then call a server Route Handler that passes the Storage URL to Requesty for transcription using a supported audio-to-text model.

**Rationale**: Keeps audio processing server-side (constitution compliant), avoids streaming audio directly from browser to LLM API, and uses Supabase Storage as an intermediate buffer so large recordings don't block the UI.

**Implementation detail**:
- Max recording length: 10 minutes (enforced client-side; ~15MB at Opus quality).
- Supported formats: WebM/Opus (all modern browsers); Safari fallback: MP4/AAC.
- Transcription result replaces the text input area content; user can edit before submitting.
- Audio files are deleted from Storage after successful transcription (no long-term audio retention).

**Alternatives considered**: Direct browser → Requesty streaming — rejected because it would expose the Requesty API key to the client. Browser Speech Recognition API — rejected because it requires browser permission persistence, has limited language support, and produces no audit trail.

---

## 3. n8n Integration Pattern

**Decision**: Next.js communicates with n8n exclusively via authenticated webhook triggers. n8n calls back to a Next.js Route Handler with results when generation is complete (async pattern).

**Rationale**: Generation can take 10–30 seconds; a synchronous HTTP request would risk timeout. The async webhook pattern keeps the UI responsive using TanStack Query polling for completion status.

**Webhook security**: n8n webhooks are secured with a shared secret (`N8N_WEBHOOK_SECRET`) sent as a `X-Webhook-Secret` header. The Next.js Route Handler validates this header before accepting any payload. The secret is stored in environment variables and never exposed to the client.

**Workflow per session type**:
| Session Type | Trigger Route | n8n Workflow |
|---|---|---|
| Requirements | `POST /api/generate` `type=requirements` | `requirements-generation.json` |
| Sprint | `POST /api/generate` `type=sprint` | `sprint-generation.json` |
| Meeting | `POST /api/generate` `type=meeting` | `meeting-generation.json` |
| AC Enrichment | `POST /api/generate` `type=ac` | `ac-enrichment.json` |

**Polling**: Client polls `GET /api/sessions/[id]/status` every 2 seconds (TanStack Query `refetchInterval`) until status transitions from `generating` → `ready` or `error`.

**Alternatives considered**: Server-Sent Events — rejected as more complex to implement with App Router and adds stateful connection management. Direct LLM call in Route Handler — rejected because it bypasses the n8n orchestration requirement and makes prompt chaining harder to modify without code deploys.

---

## 4. OAuth Token Encryption in Supabase

**Decision**: Encrypt `access_token` and `refresh_token` at the application layer using AES-256-GCM before writing to Supabase. The encryption key (`TOKEN_ENCRYPTION_KEY`) is a 32-byte random secret stored in the environment (never in the DB).

**Rationale**: Supabase Postgres encrypts data at rest, but application-layer encryption ensures tokens are unreadable even with direct database access or a Supabase breach. AES-256-GCM provides authenticated encryption (integrity + confidentiality).

**Implementation**: Use Node.js `crypto.createCipheriv` / `createDecipheriv` with a random IV per encryption. Store `iv` and `ciphertext` as a single base64 string in the `encrypted_access_token` and `encrypted_refresh_token` columns.

**Alternatives considered**: Store tokens in plain text with RLS — rejected because RLS protects row-level access but not against a DB compromise or Supabase support access. Supabase Vault — viable alternative; not chosen because it adds an external dependency and the custom crypto approach is straightforward and self-contained.

---

## 5. Multilingual Support

**Decision**: Pass the detected or user-specified input language as a parameter in the n8n generation prompt. Instruct the LLM to respond in the same language as the input. No explicit language detection library is needed — Requesty-routed LLMs (GPT-4o, Claude 3.5) handle multilingual input natively.

**Rationale**: The LLM already handles multilingual understanding and generation. Adding a separate language detection library would add complexity without meaningful improvement.

**Constraint**: Language support is bounded by the capabilities of the configured Requesty model. The set of supported languages is documented in `README.md` at release (not hardcoded in the application).

---

## 6. Supabase Realtime vs. Polling for Session Status

**Decision**: Use polling (TanStack Query `refetchInterval: 2000`) for session status updates during generation.

**Rationale**: Supabase Realtime would require a persistent WebSocket connection and additional RLS policy for the `generation_sessions` table's realtime publication. Polling is simpler, deterministic, and entirely sufficient for the PoC scale (tens of users). The polling interval stops automatically when status leaves `generating`.

**Alternatives considered**: Supabase Realtime — viable for production; deferred to post-PoC.

---

## 7. Story Points Handling (Undefined Estimates)

**Decision**: Story points are a nullable integer on the `generated_stories` table. When computing the session summary total, `null` values are treated as `0` in the sum but displayed as `—` in the UI so users can see which stories have no estimate.

**Rationale**: Prevents the summary from being misleading when the LLM cannot confidently estimate complexity. The pure function `computeSessionSummary()` in `lib/utils/session-summary.ts` encapsulates this logic and is unit-tested.
