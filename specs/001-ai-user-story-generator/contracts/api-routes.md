# API Routes Contract

**Branch**: `001-ai-user-story-generator` | **Date**: 2026-05-03

All routes are Next.js App Router Route Handlers. All authenticated routes require a valid Supabase session cookie. All server-to-Jira calls use the user's decrypted OAuth access token. Request/response bodies are validated with Zod schemas defined in `lib/schemas/`.

---

## Authentication

### `GET /api/auth/jira`
Initiates the Jira OAuth 2.0 3-legged flow.

**Auth required**: No
**Server action**: Generates PKCE verifier/challenge, stores verifier in encrypted cookie, redirects to Atlassian authorization URL.
**Response**: `302 Redirect` → Atlassian OAuth consent screen
**Caching**: `no-store`

---

### `GET /api/auth/callback`
Exchanges the OAuth authorization code for tokens and establishes the user session.

**Auth required**: No
**Query params**:
| Param | Type | Required |
|---|---|---|
| `code` | string | Yes |
| `state` | string | Yes |

**Server action**:
1. Validates `state` matches stored value.
2. Exchanges `code` + PKCE verifier for `access_token` + `refresh_token`.
3. Fetches Jira user profile (`/rest/api/3/myself`).
4. Upserts `user_profiles` and `jira_tokens` via service-role client.
5. Creates Supabase Auth session.

**Response**: `302 Redirect` → `/` (authenticated home)
**Error**: `302 Redirect` → `/login?error=<reason>`
**Caching**: `no-store`

---

## Generation Sessions

### `POST /api/generate`
Triggers an n8n generation workflow and creates a pending session record.

**Auth required**: Yes
**Request body** (JSON, Zod-validated):
```ts
{
  type: "requirements" | "sprint" | "meeting" | "ac_enrichment"
  sourceText?: string        // min 10 words if no audioPath
  audioPath?: string         // Supabase Storage path (if audio recorded)
  jiraProjectKey: string
  epicId?: string            // requirements only
  sprintId?: string          // sprint only
  contextTicketIds?: string[] // ac_enrichment only
}
```
**Response** `201`:
```ts
{ sessionId: string, status: "generating" }
```
**Error**: `400` validation failure | `401` unauthenticated | `502` n8n unreachable
**Caching**: `no-store`

---

### `GET /api/sessions`
Lists all generation sessions for the authenticated user (history).

**Auth required**: Yes
**Query params**: `limit` (default 20), `offset` (default 0)
**Response** `200`:
```ts
{
  sessions: Array<{
    id: string
    sessionType: string
    status: string
    sourceInputPreview: string  // first 120 chars of source text
    storyCount: number
    createdAt: string           // ISO 8601
  }>
  total: number
}
```
**Caching**: `no-store` (always fresh — history list)

---

### `GET /api/sessions/[id]`
Returns the full detail of a single session including all stories.

**Auth required**: Yes (must own session)
**Response** `200`:
```ts
{
  session: { id, sessionType, status, sourceInputText, sourceInputTranscription,
             jiraProjectKey, epicId, sprintId, createdAt }
  stories: Array<{
    id, title, userStoryStatement, acceptanceCriteria, generatedTitle,
    generatedUserStoryStatement, generatedAcceptanceCriteria,
    priority, labels, storyPoints, status, jiraIssueKey, jiraIssueUrl, sortOrder
  }>
  summary?: { storyCount: number, totalStoryPoints: number }  // sprint/meeting only
}
```
**Error**: `404` not found | `403` not owner
**Caching**: `no-store`

---

### `GET /api/sessions/[id]/status`
Lightweight polling endpoint for generation status.

**Auth required**: Yes
**Response** `200`:
```ts
{ status: "generating" | "ready" | "error", errorMessage?: string }
```
**Caching**: `no-store`

---

### `PATCH /api/sessions/[id]/stories/[storyId]`
Updates an editable field on a generated story during review.

**Auth required**: Yes (must own session)
**Request body** (partial, all optional):
```ts
{
  title?: string
  userStoryStatement?: string
  acceptanceCriteria?: object
  priority?: string
  labels?: string[]
  storyPoints?: number | null
  status?: "pending" | "approved" | "rejected"
}
```
**Response** `200`: Updated story object
**Note**: `generated_*` fields are immutable and ignored if sent.
**Caching**: `no-store`

---

## Jira Operations

### `POST /api/jira/push`
Creates approved stories as Jira issues.

**Auth required**: Yes
**Request body**:
```ts
{ sessionId: string }
```
**Server action**:
1. Loads all `approved` stories for the session.
2. Checks for duplicate push (warns if session already `pushed`).
3. Creates each story as a Jira issue using the field mapping in `lib/jira/field-mapping.ts`.
4. Updates `jira_issue_key` + `jira_issue_url` on each story row.
5. Updates session status to `pushed`.

**Response** `200`:
```ts
{
  pushed: Array<{ storyId: string, jiraIssueKey: string, jiraIssueUrl: string }>
  failed: Array<{ storyId: string, error: string }>
}
```
**Caching**: `no-store`

---

### `GET /api/jira/projects`
Lists Jira projects accessible under the user's OAuth token.

**Auth required**: Yes
**Response** `200`:
```ts
{ projects: Array<{ key: string, name: string, avatarUrl?: string }> }
```
**Caching**: Revalidate every 5 minutes (`cache: "force-cache", next: { revalidate: 300 }`) — project lists rarely change.

---

### `GET /api/jira/epics`
Lists epics for the active project.

**Auth required**: Yes
**Query params**: `projectKey` (required)
**Response** `200`:
```ts
{ epics: Array<{ id: string, key: string, summary: string }> }
```
**Caching**: Revalidate every 60 seconds.

---

### `GET /api/jira/sprints`
Lists active/future sprints for the active project.

**Auth required**: Yes
**Query params**: `projectKey` (required), `state` (default: `active,future`)
**Response** `200`:
```ts
{ sprints: Array<{ id: string, name: string, state: string, goal?: string }> }
```
**Caching**: Revalidate every 60 seconds.

---

### `GET /api/jira/search`
Searches Jira tickets by keyword or issue key.

**Auth required**: Yes
**Query params**: `q` (required, min 2 chars), `projectKey` (optional)
**Response** `200`:
```ts
{ issues: Array<{ key: string, summary: string, description?: string }> }
```
**Caching**: `no-store` (search results must be live)

---

## User Profile

### `GET /api/profile`
Returns the authenticated user's profile and preferences.

**Auth required**: Yes
**Response** `200`:
```ts
{
  jiraAccountId: string
  jiraDisplayName: string
  defaultJiraProjectKey?: string
  defaultJiraProjectName?: string
}
```
**Caching**: `no-store`

---

### `PATCH /api/profile`
Updates user preferences.

**Auth required**: Yes
**Request body**:
```ts
{
  defaultJiraProjectKey?: string
  defaultJiraProjectName?: string
}
```
**Response** `200`: Updated profile object
**Caching**: `no-store`

---

## n8n Callback (internal)

### `POST /api/generate/callback`
Receives the generation result from n8n after LLM processing completes.

**Auth required**: No (validated via `X-Webhook-Secret` header matching `N8N_WEBHOOK_SECRET` env var)
**Request body**:
```ts
{
  sessionId: string
  executionId: string
  status: "success" | "error"
  stories?: Array<{
    title: string
    userStoryStatement: string
    acceptanceCriteria: object
    priority: string
    labels: string[]
    storyPoints?: number
  }>
  errorMessage?: string
}
```
**Server action**: Validates secret, upserts stories into `generated_stories`, updates session status.
**Response** `200`: `{ ok: true }`
**Error**: `401` invalid secret | `400` invalid payload
**Caching**: `no-store`
