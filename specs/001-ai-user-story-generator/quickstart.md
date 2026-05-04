# Quickstart: AI User Story Generator

**Branch**: `001-ai-user-story-generator` | **Date**: 2026-05-03

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- A Supabase project (ca-central-1)
- A Jira Cloud account with an OAuth 2.0 app registered at https://developer.atlassian.com/console/myapps/
- An n8n instance (self-hosted or cloud) with the webhook workflows imported
- A Requesty API key

---

## 1. Clone and Install

```bash
git clone <repo-url>
cd user-story-generator
pnpm install
```

---

## 2. Environment Variables

Copy the example file and fill in all values:

```bash
cp .env.example .env.local
```

**.env.local** required variables:

> Variables marked ✅ are already set in `.env.local`. Variables marked ⬜ still need to be added.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co   # ✅ configured
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...     # ✅ configured
SUPABASE_DB_PASSWORD=<db-password>                          # ✅ configured
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>                # ⬜ add this

# Jira OAuth 2.0 (3LO) — replaces the legacy JIRA_API_KEY
JIRA_CLIENT_ID=<your-atlassian-app-client-id>               # ⬜ add this
JIRA_CLIENT_SECRET=<your-atlassian-app-client-secret>       # ⬜ add this
JIRA_REDIRECT_URI=http://localhost:3000/api/auth/callback    # ⬜ add this
# Jira custom field IDs (project-specific — find in Jira field configuration)
JIRA_STORY_POINTS_FIELD_ID=customfield_10016                # ⬜ add this
JIRA_SPRINT_FIELD_ID=customfield_10020                      # ⬜ add this
JIRA_BLOCKS_LINK_TYPE=Blocks                                # ⬜ add this (default: Blocks)

# n8n
N8N_WEBHOOK_URL=https://<your-n8n-instance>/webhook         # ⬜ add this
N8N_WEBHOOK_SECRET=<random-32-char-secret>                  # ⬜ add this
NEXTJS_BASE_URL=http://localhost:3000                       # ⬜ add this

# Requesty
REQUESTY_API_KEY=<your-requesty-key>                        # ✅ configured

# Token encryption (generate with: openssl rand -base64 32)
TOKEN_ENCRYPTION_KEY=<32-byte-base64-secret>                # ⬜ add this
```

> **Note**: `JIRA_API_KEY` in `.env.local` is the legacy Atlassian API key. It will be superseded by the OAuth 2.0 flow once `JIRA_CLIENT_ID`/`JIRA_CLIENT_SECRET` are configured and the OAuth callback is wired up.

---

## 3. Database Setup

Install the Supabase CLI and link your project:

```bash
pnpm add -D supabase
pnpm supabase login
pnpm supabase link --project-ref <project-id>
```

Run migrations:

```bash
pnpm supabase db push
```

Generate TypeScript types:

```bash
pnpm supabase gen types typescript --linked > lib/supabase/types.ts
```

---

## 4. shadcn/ui Setup

If not already initialised:

```bash
pnpm dlx shadcn@latest init
```

Select **Custom** theme when prompted, then replace the generated CSS variables in `app/globals.css` with the Figma Make theme from `default_shadcn_theme.css`.

Add required components:

```bash
pnpm dlx shadcn@latest add button input textarea select dialog card badge label toast
```

---

## 5. n8n Workflows

1. Open your n8n instance.
2. Import each JSON file from `workflows/`:
   - `requirements-generation.json`
   - `sprint-generation.json`
   - `meeting-generation.json`
   - `ac-enrichment.json`
3. For each workflow, configure the Requesty credential in n8n's credential vault.
4. Activate all four workflows and copy their webhook URLs into `N8N_WEBHOOK_URL` (base URL).

---

## 6. Jira OAuth App Configuration

In the Atlassian Developer Console for your app:

1. Set **Callback URL** to: `http://localhost:3000/api/auth/callback` (update for production).
2. Enable the following OAuth 2.0 scopes:
   - `read:me`
   - `read:jira-user`
   - `read:jira-work`
   - `write:jira-work`
   - `offline_access`

---

## 7. Run Locally

```bash
pnpm dev
```

Open http://localhost:3000 — you will be redirected to the Jira login flow.

---

## 8. Run Tests

```bash
# Unit tests (Vitest)
pnpm test

# E2E tests (Playwright) — requires dev server running
pnpm test:e2e
```

---

## 9. Build and Lint Check

```bash
pnpm lint
pnpm build
```

Both must pass before merging any PR.

---

## Key Commands Reference

| Command | Purpose |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint check |
| `pnpm format:check` | Prettier check |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm supabase db push` | Apply migrations |
| `pnpm supabase gen types typescript --linked > lib/supabase/types.ts` | Regenerate DB types |
