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
