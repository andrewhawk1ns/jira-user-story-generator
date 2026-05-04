# n8n Webhook Contract

**Branch**: `001-ai-user-story-generator` | **Date**: 2026-05-03

Defines the interface between Next.js and n8n. Next.js triggers n8n via webhook; n8n calls back to Next.js when complete.

---

## Trigger: Next.js → n8n

**Endpoint**: Configured per n8n workflow (stored in env var `N8N_WEBHOOK_URL`)
**Method**: `POST`
**Auth**: `X-Webhook-Secret: {N8N_WEBHOOK_SECRET}`

### Payload (all session types share this envelope)

```ts
{
  sessionId: string            // UUID of the generation_sessions row
  sessionType: "requirements" | "sprint" | "meeting" | "ac_enrichment"
  sourceText: string           // Pasted text or audio transcription
  language?: string            // Detected language code
  jiraProjectKey: string
  callbackUrl: string          // {NEXTJS_BASE_URL}/api/generate/callback

  // Session-type specific context (only one will be present)
  epicContext?: {
    epicId: string
    epicSummary: string
    epicDescription?: string
  }
  sprintContext?: {
    sprintId: string
    sprintName: string
    sprintGoal?: string
  }
  contextTickets?: Array<{     // AC enrichment only
    key: string
    summary: string
    description?: string
  }>
}
```

---

## Callback: n8n → Next.js

**Endpoint**: `POST {NEXTJS_BASE_URL}/api/generate/callback`
**Auth**: `X-Webhook-Secret: {N8N_WEBHOOK_SECRET}`

### Success payload

```ts
{
  sessionId: string
  executionId: string
  status: "success"
  stories: Array<{
    title: string
    userStoryStatement: string    // "As a [role], I want [action], so that [benefit]"
    acceptanceCriteria: Array<{
      given: string
      when: string
      then: string
    }>
    priority: "highest" | "high" | "medium" | "low" | "lowest"
    labels: string[]
    storyPoints?: number          // null if not estimable
  }>
}
```

### Error payload

```ts
{
  sessionId: string
  executionId: string
  status: "error"
  errorMessage: string
}
```

---

## n8n Workflow Responsibilities

Each workflow in `workflows/` must:

1. Receive the trigger payload and validate `sessionId` is present.
2. Build the LLM prompt using the payload context (epic/sprint/tickets as appropriate).
3. Call Requesty with the prompt and parse the structured JSON response.
4. Validate the response against the expected story schema.
5. POST the callback to `callbackUrl` with the success or error payload.
6. Never store credentials in workflow nodes — use n8n credential vault.

---

## Environment Variables

| Variable | Description |
|---|---|
| `N8N_WEBHOOK_URL` | Base URL of the n8n webhook trigger endpoint |
| `N8N_WEBHOOK_SECRET` | Shared secret validated on both trigger and callback |
| `NEXTJS_BASE_URL` | Public base URL of the Next.js app (for callback construction) |
