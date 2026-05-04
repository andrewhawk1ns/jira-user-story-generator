# Data Model: AI User Story Generator

**Branch**: `001-ai-user-story-generator` | **Date**: 2026-05-03

All tables live in the Supabase Postgres instance (ca-central-1). RLS is enabled on every table. Migrations are managed under `supabase/migrations/`.

---

## Entity Relationship Summary

```
users (Supabase Auth)
  │
  ├──< jira_tokens          (1:1 per user — OAuth access + refresh token)
  ├──< user_profiles        (1:1 per user — preferences, default project)
  └──< generation_sessions  (1:many — each generation run)
         │
         └──< generated_stories (1:many — each story in a session)
                │
                └──> jira_issues (1:optional — created Jira ticket reference)
```

---

## Tables

### `user_profiles`

Stores user preferences. Created on first login via Jira OAuth.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | No | PK, references `auth.users(id)` |
| `jira_account_id` | `text` | No | Jira user account ID from OAuth token introspection |
| `jira_display_name` | `text` | Yes | Display name from Jira profile |
| `default_jira_project_key` | `text` | Yes | User's chosen default project key |
| `default_jira_project_name` | `text` | Yes | Cached display name for the default project |
| `created_at` | `timestamptz` | No | Default: `now()` |
| `updated_at` | `timestamptz` | No | Updated via trigger |

**Validation**: `jira_account_id` must be non-empty on insert.
**RLS**: User can only select/update their own row (`auth.uid() = id`).

---

### `jira_tokens`

Stores encrypted Jira OAuth tokens. One row per user.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | No | PK, references `auth.users(id)` |
| `encrypted_access_token` | `text` | No | AES-256-GCM encrypted, base64 encoded (iv:ciphertext) |
| `encrypted_refresh_token` | `text` | Yes | AES-256-GCM encrypted; null if `offline_access` not granted |
| `token_expires_at` | `timestamptz` | No | When the access token expires; used to trigger refresh |
| `scopes` | `text[]` | No | Granted OAuth scopes |
| `jira_cloud_id` | `text` | No | Atlassian cloud instance ID for API calls |
| `jira_base_url` | `text` | No | e.g. `https://yourorg.atlassian.net` |
| `created_at` | `timestamptz` | No | Default: `now()` |
| `updated_at` | `timestamptz` | No | Updated via trigger |

**Validation**: `encrypted_access_token` and `jira_cloud_id` must be non-empty.
**RLS**: Only the owning user and service-role can access (`auth.uid() = id`). Tokens are never returned to the client — only server-side code reads this table.

---

### `generation_sessions`

One row per generation run (requirements, sprint, meeting, AC enrichment).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | No | PK, default: `gen_random_uuid()` |
| `user_id` | `uuid` | No | FK → `auth.users(id)` |
| `session_type` | `text` | No | Enum: `requirements`, `sprint`, `meeting`, `ac_enrichment` |
| `status` | `text` | No | Enum: `generating`, `ready`, `error`, `in_review`, `approved`, `pushed` |
| `source_input_text` | `text` | Yes | Raw pasted/typed text (null if audio only) |
| `source_input_audio_path` | `text` | Yes | Supabase Storage path for uploaded audio (null if text only) |
| `source_input_transcription` | `text` | Yes | Transcribed text from audio |
| `input_language` | `text` | Yes | Detected/inferred language code (e.g. `en`, `fr`) |
| `jira_project_key` | `text` | Yes | Active project at time of generation |
| `jira_epic_id` | `text` | Yes | Selected epic ID (requirements sessions only) |
| `jira_sprint_id` | `text` | Yes | Selected sprint ID (sprint sessions only) |
| `n8n_execution_id` | `text` | Yes | n8n execution ID for tracing |
| `error_message` | `text` | Yes | Set when status = `error` |
| `created_at` | `timestamptz` | No | Default: `now()` |
| `updated_at` | `timestamptz` | No | Updated via trigger |

**Validation**:
- `session_type` must be one of the defined enum values.
- At least one of `source_input_text` or `source_input_audio_path` must be non-null (enforced via check constraint).
- `status` transitions are enforced in application code (not DB-level) for simplicity.

**RLS**:
- Users can select/update only their own sessions (`user_id = auth.uid()`).
- Insert allowed for authenticated users.
- Delete not permitted (history must be preserved).

---

### `generated_stories`

One row per story within a session.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | No | PK, default: `gen_random_uuid()` |
| `session_id` | `uuid` | No | FK → `generation_sessions(id)` |
| `user_id` | `uuid` | No | Denormalised for RLS efficiency |
| `title` | `text` | No | Story title |
| `user_story_statement` | `text` | No | "As a [role], I want [action], so that [benefit]" |
| `generated_acceptance_criteria` | `jsonb` | No | Original LLM output — immutable after creation |
| `acceptance_criteria` | `jsonb` | No | Current (editable) AC; initialised from `generated_acceptance_criteria` |
| `generated_title` | `text` | No | Original LLM title — immutable after creation |
| `generated_user_story_statement` | `text` | No | Original LLM statement — immutable after creation |
| `priority` | `text` | Yes | Suggested: `highest`, `high`, `medium`, `low`, `lowest` |
| `labels` | `text[]` | Yes | Suggested Jira labels |
| `story_points` | `integer` | Yes | Suggested estimate; null if LLM cannot estimate |
| `status` | `text` | No | Enum: `pending`, `approved`, `rejected` |
| `jira_issue_key` | `text` | Yes | Set after successful Jira push (e.g. `PROJ-42`) |
| `jira_issue_url` | `text` | Yes | Direct URL to the created Jira issue |
| `sort_order` | `integer` | No | Display order within session |
| `created_at` | `timestamptz` | No | Default: `now()` |
| `updated_at` | `timestamptz` | No | Updated via trigger |

**Validation**:
- `generated_*` columns are immutable — application code must never update them after insert (audit trail).
- `status` must be one of `pending`, `approved`, `rejected`.
- `story_points` must be a positive integer when non-null.

**RLS**: Users can select/update only stories belonging to their sessions (`user_id = auth.uid()`). The `generated_*` columns are protected from client-side update by only being written via service-role (server-side insert).

---

## Key Indexes

```sql
-- Session lookups by user
CREATE INDEX idx_generation_sessions_user_id ON generation_sessions(user_id);

-- Stories by session
CREATE INDEX idx_generated_stories_session_id ON generated_stories(session_id);

-- Pending review check
CREATE INDEX idx_generated_stories_status ON generated_stories(session_id, status);

-- Token expiry check
CREATE INDEX idx_jira_tokens_expires_at ON jira_tokens(token_expires_at);
```

---

## State Transitions

### `generation_sessions.status`

```
generating → ready     (n8n callback success)
generating → error     (n8n callback failure / timeout)
ready      → in_review (user opens review screen)
in_review  → approved  (all stories reviewed)
approved   → pushed    (all approved stories created in Jira)
```

### `generated_stories.status`

```
pending → approved  (user approves)
pending → rejected  (user rejects)
approved → pending  (user reverses approval)
rejected → pending  (user reverses rejection)
```

---

## Computed Values (not stored)

- **Session story count**: `COUNT(*) WHERE session_id = ? AND status = 'approved'` (or all, depending on context)
- **Total story points**: `SUM(story_points) WHERE session_id = ?` — nulls treated as 0; computed in `lib/utils/session-summary.ts`

---

## Audio Storage

- **Bucket**: `audio-uploads` (private)
- **Path pattern**: `{user_id}/{session_id}/recording.webm`
- **Lifecycle**: Deleted after successful transcription via a server-side cleanup call
- **Max size**: 15MB (enforced in Supabase Storage bucket settings and client-side)
- **RLS**: Users can only upload/read files under their own `user_id` prefix
