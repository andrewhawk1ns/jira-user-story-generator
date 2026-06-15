# User Story Generation — End-to-End Architecture

## High-Level Architecture

```mermaid
graph LR
    Browser["Browser\n(GeneratePage.tsx)"]
    API["Next.js\nPOST /api/generate"]
    DB[("Supabase\nPostgres")]
    N8N["n8n Workflow\n(Jira User Story Generator)"]
    LLM["LLM\n(Requesty / GPT)"]

    Browser -->|"POST /api/generate\n{ sourceText, jiraProjectKey, … }"| API
    API -->|"INSERT generation_sessions\nstatus = generating"| DB
    API -->|"POST webhook\n{ sessionId, sourceText, … }\nx-webhook-secret: …"| N8N
    N8N -->|"Prompt"| LLM
    LLM -->|"{ stories: […] }"| N8N
    N8N -->|"{ output: { stories: […] } }\nsynchronous HTTP response"| API
    API -->|"INSERT generated_stories"| DB
    API -->|"UPDATE generation_sessions\nstatus = ready"| DB
    API -->|"{ sessionId, stories: […] }"| Browser
```

---

## Detailed Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant API as Next.js /api/generate
    participant DB as Supabase
    participant N8N as n8n Workflow
    participant Classifier as LLM — Content Classifier
    participant Generator as LLM — Story Generator

    Browser->>API: POST /api/generate\n{ type, sourceText, jiraProjectKey,\n  outputLanguage, storyType,\n  priority, dependencies[] }

    Note over API: Zod validate request body
    API->>DB: INSERT generation_sessions\n{ session_type, source_input_text,\n  jira_project_key, status=generating }
    DB-->>API: { id: sessionId }

    API->>N8N: POST N8N_WEBHOOK_URL\nheader: x-webhook-secret\nbody: { sessionId, userId,\n  sourceText, jiraProjectKey,\n  outputLanguage, storyType,\n  priority, dependencies[] }

    rect rgb(240, 248, 255)
        Note over N8N: Webhook node (headerAuth)
        N8N->>Classifier: Classify: is content safe?
        Classifier-->>N8N: { flagged: bool, reason: string }
        N8N->>N8N: Parse Classifier Result (Set node)

        alt content flagged
            N8N-->>API: { error: "content_rejected", message }
        else content safe
            N8N->>Generator: Generate user stories prompt\n(sourceText, outputLanguage,\n storyType, priority, dependencies)
            Generator-->>N8N: Raw JSON string\n{ stories: [{ title, description,\n  acceptanceCriteria[], storyPoints,\n  labels[], blockedByIssueKeys[],\n  blocksIssueKeys[] }] }
            N8N->>N8N: Parse Stories Result (Set node)\n$json.text → JSON.parse → { output: parsed }
            N8N-->>API: { output: { stories: […] } }
        end
    end

    alt content_rejected
        API->>DB: UPDATE generation_sessions\nstatus=error, error_message
        API-->>Browser: 422 { error: "content_rejected", message }
    else stories returned
        Note over API: Zod validate n8nResponseSchema\nMap stories → DB rows
        API->>DB: INSERT generated_stories[]\n(title, user_story_statement,\n acceptance_criteria, story_points,\n labels, blocked_by_issue_keys, …)
        API->>DB: UPDATE generation_sessions\nstatus=ready
        API-->>Browser: 200 { sessionId, stories[] }
    end

    Browser->>Browser: Render story cards\n(GeneratePage right panel)
```

---

## Authentication Flow — Jira OAuth 2.0 + PKCE

The app uses Jira as the sole identity provider. Supabase handles session management but does not issue credentials independently — every user is created/linked via the Atlassian OAuth callback.

There are two paths: a **silent refresh** path for returning users and a **full OAuth** path for first-time logins or when the refresh token has expired.

### Silent Refresh (returning users)

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant Next as Next.js GET /api/auth/refresh
    participant Atlassian as Atlassian OAuth
    participant Supabase as Supabase (Admin)

    Browser->>Browser: LoginPage mounts\nfetch GET /api/auth/refresh
    Next->>Next: Read sg_uid cookie (30-day httpOnly)
    alt no sg_uid cookie
        Next-->>Browser: 401 { reason: "no_uid_cookie" }
        Browser->>Browser: Show login button (full OAuth path)
    else sg_uid present
        Next->>Supabase: jira_tokens SELECT\nWHERE id = uid
        Supabase-->>Next: { encrypted_refresh_token }
        Next->>Atlassian: POST /oauth/token\n{ grant_type=refresh_token, refresh_token }
        Atlassian-->>Next: { access_token, refresh_token, expires_in }
        Next->>Supabase: jira_tokens UPDATE\n{ encrypted_access_token, token_expires_at }
        Next->>Supabase: admin.getUserById(uid) → email
        Next->>Supabase: admin.generateLink({ type: "magiclink", email })
        Supabase-->>Next: { hashed_token }
        Next->>Supabase: auth.verifyOtp({ token_hash })
        Supabase-->>Next: { session }
        Note over Next: Set Supabase session cookies\nvia @supabase/ssr setSession()
        Next-->>Browser: 200 { success: true }\nSet-Cookie: sb-access-token, sb-refresh-token
        Browser->>Browser: window.location.href = "/"
    end
```

### Full OAuth (first login or refresh token expired)

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant Next as Next.js
    participant Atlassian as Atlassian OAuth
    participant Jira as Jira REST API
    participant Supabase as Supabase (Admin)

    Browser->>Next: GET /api/auth/jira
    Note over Next: Generate PKCE verifier + challenge\nGenerate random state (16-byte hex)
    Next-->>Browser: { url: "https://auth.atlassian.com/authorize?…" }\nSet-Cookie: jira_pkce_verifier (httpOnly, 10 min)\nSet-Cookie: jira_oauth_state (httpOnly, 10 min)

    Browser->>Atlassian: Redirect → Authorization URL\n(response_type=code, code_challenge, state, scope)\nNo prompt=consent — Atlassian skips consent screen\nfor previously approved scopes
    Note over Atlassian: First login: user grants consent\nSubsequent logins: consent screen skipped
    Atlassian->>Next: GET /api/auth/callback?code=…&state=…

    Note over Next: Validate state cookie matches query param\nRead stored PKCE verifier\nDelete PKCE cookies
    Next->>Atlassian: POST /oauth/token\n{ code, code_verifier, grant_type=authorization_code }
    Atlassian-->>Next: { access_token, refresh_token, expires_in, scope }

    Next->>Jira: GET /oauth/token/accessible-resources
    Jira-->>Next: [{ id: cloudId, url: baseUrl }]
    Next->>Jira: GET /rest/api/3/myself
    Jira-->>Next: { accountId, displayName }

    Next->>Supabase: admin.createUser\n{ email: "{accountId}@atlassian.local", email_confirm: true }
    alt new user
        Supabase-->>Next: { user: { id: userId } }
    else user already exists (email taken)
        Next->>Supabase: admin.listUsers() → find by email
        Supabase-->>Next: { id: userId }
    end

    Next->>Supabase: jira_tokens.upsert\n{ encrypted_access_token, encrypted_refresh_token,\n  token_expires_at, scopes, jira_cloud_id, jira_base_url }
    Next->>Supabase: user_profiles.upsert\n{ jira_account_id, jira_display_name }

    Note over Next: Tokens are AES-encrypted before storage
    Next->>Supabase: admin.generateLink({ type: "magiclink", email })
    Supabase-->>Next: { hashed_token }
    Next->>Supabase: auth.verifyOtp({ token_hash, type: "magiclink" })
    Supabase-->>Next: { session: { access_token, refresh_token } }

    Note over Next: Set Supabase session cookies\nvia @supabase/ssr setSession()\nSet sg_uid cookie (httpOnly, 30 days)
    Next-->>Browser: 302 Redirect → /\nSet-Cookie: sb-access-token, sb-refresh-token, sg_uid
```

> **Why the magic-link trick?** Supabase doesn't natively support "log in as this user" from server-side code. Generating a magic link and immediately verifying its OTP hash server-side is the approved pattern for creating a Supabase session after an external OAuth flow without sending any email.

> **Why `sg_uid` and not the Supabase session cookie?** Supabase session cookies are short-lived (typically 1 hour). The `sg_uid` cookie lives for 30 days and is used only to look up which user's Jira refresh token to use — it is not a credential on its own.

---

## n8n Workflow — Internal Node Graph

```mermaid
flowchart TD
    W["🔗 Webhook\nPOST · headerAuth\nresponseMode: lastNode"]
    CC["🤖 LLM Content Classifier\nchainLlm · gpt-5-nano\ntemp: 0"]
    PC["⚙️ Parse Classifier Result\nSet node — reads $json.output\nOutputs: { body, flagged, flaggedReason }"]
    IF{"❓ Is Flagged?\nIF node\nflagged === true"}
    ERR["❌ Return Moderation Error\nSet node\n{ error: content_rejected, message }"]
    GEN["🤖 Generate User Stories\nchainLlm · gpt-5-nano\ntemp: 0.4\nSystem: agile coach persona\n2–6 stories per run"]
    PS["⚙️ Parse Stories Result\nSet node — reads $json.text\nStrips ``` fences → JSON.parse\n{ output: { stories[] } }"]

    W --> CC --> PC --> IF
    IF -- true --> ERR
    IF -- false --> GEN --> PS
```

> **Key implementation detail:** `chainLlm` without a Structured Output Parser subnode writes the raw LLM text to `$json.text`. The **Parse Stories Result** Set node reads `$json.text || $json.output` to safely handle both cases, strips any markdown code fences, then `JSON.parse`s the result.

---

## Payload Contracts

### Next.js → n8n Webhook (`POST N8N_WEBHOOK_URL`)

| Field | Type | Notes |
|---|---|---|
| `sessionId` | `string` (UUID) | Supabase `generation_sessions.id` |
| `userId` | `string` (UUID) | Supabase `auth.users.id` |
| `type` | `"requirements" \| "sprint" \| "meeting" \| "ac_enrichment"` | Session type |
| `sourceText` | `string \| null` | Business requirements text |
| `audioPath` | `string \| null` | Path to uploaded audio (future) |
| `jiraProjectKey` | `string` | e.g. `"PROJ"` |
| `epicId` | `string \| null` | Jira epic ID |
| `sprintId` | `string \| null` | Jira sprint ID |
| `outputLanguage` | `string` | Default `"English"` |
| `storyType` | `"User Story" \| "Bug" \| "Task" \| "Sub-task"` | Default `"User Story"` |
| `priority` | `"Highest" \| "High" \| "Medium" \| "Low" \| "Lowest"` | Default `"Medium"` |
| `dependencies` | `{ type, issueKey, summary? }[]` | Jira issue links |

### n8n → Next.js Response (synchronous, `responseMode: lastNode`)

```json
{
  "output": {
    "stories": [
      {
        "title": "Export reports to CSV",
        "description": "As an analyst, I want to export reports to CSV so that I can share data.",
        "acceptanceCriteria": [
          "Given I am on the reports page, when I click Export, then a CSV download begins"
        ],
        "storyPoints": 3,
        "labels": ["user-story", "medium-priority"],
        "blockedByIssueKeys": [],
        "blocksIssueKeys": []
      }
    ]
  }
}
```

### Error response (content moderation rejection)

```json
{
  "error": "content_rejected",
  "message": "Input contains harmful content. Please revise your input and try again.",
  "stories": []
}
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `N8N_WEBHOOK_URL` | ✅ | Full URL of the n8n webhook trigger node |
| `N8N_WEBHOOK_SECRET` | ✅ | Sent as `x-webhook-secret` header; validated by n8n Header Auth credential |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server — bypasses RLS for inserts) |
