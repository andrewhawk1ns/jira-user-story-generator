# Story Generator for Jira

An AI-powered web app that converts business requirements into well-structured Jira user stories. Paste your requirements (or record them as audio), select a Jira project, and generate ready-to-use user stories with titles, descriptions, acceptance criteria, story point estimates, and labels — all in seconds.

## Stack

- **Next.js 15** (App Router, React Server Components)
- **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** — auth, database (user profiles, Jira tokens, generation sessions, generated stories)
- **Jira OAuth 2.0** — connect your Atlassian account and write stories directly to Jira
- **n8n** — local workflow automation; receives requirements via webhook, calls the AI model, returns structured stories
- **Requesty** — OpenAI-compatible AI gateway (400+ models); default model: `anthropic/claude-haiku-3-5`
- **pnpm** — package manager

## Prerequisites

- Node.js ≥ 20
- pnpm (`npm install -g pnpm`)
- A [Supabase](https://supabase.com) project
- A [Jira OAuth 2.0 app](https://developer.atlassian.com/console/myapps/) (3LO)
- A [Requesty](https://requesty.ai) account and API key
- n8n running locally (see below)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd user-story-generator
pnpm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

See [Environment Variables](#environment-variables) below for details on each key.

### 3. Start n8n

n8n must run **outside** the project directory to avoid native module conflicts:

```bash
cd ~ && npx n8n
# or install globally: npm install -g n8n && n8n
```

Open [http://localhost:5678](http://localhost:5678) and:

1. Create a credential: **OpenAI API** → name it `Requesty`, set Base URL to `https://router.requesty.ai/v1`, paste your Requesty API key
2. Create a credential: **Header Auth** → name it `Header Auth`, set Header Name to `x-webhook-secret`, value to the same string as `N8N_WEBHOOK_SECRET` in `.env.local`
3. Import or activate the **Jira User Story Generator** workflow (webhook path: `7d9c5e2a-8ad7-440f-b3a3-46755fda4334`)
4. Publish the workflow

### 4. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `SUPABASE_DB_PASSWORD` | Supabase database password |
| `JIRA_CLIENT_ID` | Jira OAuth 2.0 app Client ID |
| `JIRA_CLIENT_SECRET` | Jira OAuth 2.0 app Client Secret |
| `JIRA_REDIRECT_URI` | OAuth callback URL (e.g. `http://localhost:3000/api/auth/callback`) |
| `NEXTJS_BASE_URL` | Base URL of the Next.js app (e.g. `http://localhost:3000`) |
| `TOKEN_ENCRYPTION_KEY` | 32-byte base64 key for encrypting stored Jira tokens. Generate with: `openssl rand -base64 32` |
| `N8N_WEBHOOK_URL` | Full n8n webhook production URL (e.g. `http://localhost:5678/webhook/<uuid>`) |
| `N8N_WEBHOOK_SECRET` | Shared secret sent in `x-webhook-secret` header to authenticate n8n calls. Generate with: `openssl rand -hex 24` |
| `REQUESTY_API_KEY` | Your Requesty API key |

## Project Structure

```
app/
  page.tsx                  # Auth-gated home page (server component)
  login/page.tsx            # Login page
  api/
    auth/callback/route.ts  # Jira OAuth callback
    auth/jira/route.ts      # Jira OAuth initiation
    generate/route.ts       # POST: trigger n8n, save stories, return results
    n8n/callback/route.ts   # n8n async callback (future use)
    sessions/[id]/route.ts  # Session polling fallback
components/
  generate/GeneratePage.tsx # Main UI (requirements input + story output)
lib/
  supabase/                 # Supabase client helpers + generated types
  schemas/                  # Zod schemas for API validation
```
