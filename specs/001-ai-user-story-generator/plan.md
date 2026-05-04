# Implementation Plan: AI User Story Generator

**Branch**: `001-ai-user-story-generator` | **Date**: 2026-05-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-ai-user-story-generator/spec.md`

## Summary

Build an internal AI-assisted User Story Generator: a Next.js 16 (App Router) web application that converts unstructured text or audio input into structured, Jira-ready user stories. Users authenticate via Jira OAuth 2.0, providing the app with delegated access to create Jira issues on their behalf. Story generation is orchestrated through n8n workflows that call the LLM via Requesty. All user data, session history, OAuth tokens, and profile preferences are stored in Supabase (Canada Central). The UI is built with shadcn/ui using the Figma Make custom theme.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js (via Next.js runtime)
**Primary Dependencies**: Next.js 16, React 19, shadcn/ui, Tailwind CSS v4, Supabase JS v2 + `@supabase/ssr`, Zod, React Hook Form, TanStack Query v5, Vitest, Playwright
**Storage**: Supabase Postgres (ca-central-1 — Montreal); Supabase Storage for audio uploads
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web (desktop-first, internal users)
**Project Type**: Web application (Next.js full-stack, single repository)
**Performance Goals**: Generation response within 30 seconds for 600-word input; UI interactions < 200ms
**Constraints**: OAuth tokens never reach client; all LLM calls via Requesty proxy; RLS on all user-data tables; `pnpm lint` + `pnpm build` must pass
**Scale/Scope**: Internal PoC — tens of concurrent users; ~7 primary screens; Supabase free/pro tier sufficient

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Next.js 16 Reality First | ✅ Pass | App Router, RSC for data, `"use client"` only where needed; caching strategies documented per route |
| II. Type Safety | ✅ Pass | Strict TS; Supabase generated types; Zod at all boundaries |
| III. Design Fidelity (shadcn/ui) | ✅ Pass | Figma Make custom theme applied post-init; shadcn only |
| IV. Supabase Data & Auth | ✅ Pass | `@supabase/ssr` for cookie sessions; RLS on all tables; migrations versioned |
| V. n8n Orchestration | ✅ Pass | All generation flows via n8n webhooks; workflows exported to `workflows/` |
| VI. LLM via Requesty | ✅ Pass | No direct vendor SDK; prompt templates versioned; responses Zod-validated |
| VII. Jira OAuth | ✅ Pass | 3-legged OAuth; tokens encrypted server-side; no token in browser |
| VIII. Forms / Validation (Zod + RHF) | ✅ Pass | All forms via React Hook Form + Zod resolver |
| IX. TanStack Query | ✅ Pass | Client-side state (Jira project/epic/sprint lists, polling) via TanStack Query |
| X. Testable Behavior | ✅ Pass | Business logic in pure functions; Vitest unit; Playwright E2E |
| XI. Accessibility | ✅ Pass | shadcn/Radix primitives; no ARIA overrides; labels on all form controls |
| XII. Simplicity | ✅ Pass | Single Next.js repo; no extra abstraction layers |

**No violations. Gate passes.**

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-user-story-generator/
├── plan.md              ← this file
├── research.md          ← Phase 0
├── data-model.md        ← Phase 1
├── quickstart.md        ← Phase 1
├── contracts/           ← Phase 1
│   ├── api-routes.md
│   ├── n8n-webhooks.md
│   └── jira-field-mapping.md
├── checklists/
│   └── requirements.md
└── tasks.md             ← /speckit.tasks (not yet created)
```

### Source Code (repository root)

```text
app/
├── (auth)/
│   ├── login/
│   │   └── page.tsx                  # Jira OAuth initiation screen
│   └── callback/
│       └── page.tsx                  # OAuth callback handler
├── (app)/
│   ├── layout.tsx                    # App shell — header with project selector
│   ├── page.tsx                      # Requirements generation (home)
│   ├── sprint/
│   │   └── page.tsx                  # Sprint story generation
│   ├── meeting/
│   │   └── page.tsx                  # Meeting notes story generation
│   ├── ac-enrichment/
│   │   └── page.tsx                  # Acceptance criteria enrichment
│   ├── history/
│   │   ├── page.tsx                  # Session history list
│   │   └── [sessionId]/
│   │       └── page.tsx              # Past session detail
│   └── settings/
│       └── page.tsx                  # User profile + default project
├── api/
│   ├── auth/
│   │   ├── jira/
│   │   │   └── route.ts              # Initiate Jira OAuth flow
│   │   └── callback/
│   │       └── route.ts              # Exchange code for tokens, store in Supabase
│   ├── generate/
│   │   └── route.ts                  # Trigger n8n generation webhook
│   ├── jira/
│   │   ├── projects/
│   │   │   └── route.ts              # List accessible Jira projects
│   │   ├── epics/
│   │   │   └── route.ts              # List epics for selected project
│   │   ├── sprints/
│   │   │   └── route.ts              # List sprints for selected project
│   │   ├── search/
│   │   │   └── route.ts              # Search Jira tickets (for AC context)
│   │   └── push/
│   │       └── route.ts              # Create Jira issues from approved stories
│   └── sessions/
│       └── route.ts                  # CRUD for generation sessions
├── globals.css                       # Figma Make custom theme (applied post-shadcn-init)
└── layout.tsx                        # Root layout

components/
├── ui/                               # shadcn/ui generated components
├── generate/
│   ├── RequirementsForm.tsx
│   ├── AudioRecorder.tsx
│   ├── EpicSelector.tsx
│   └── SprintSelector.tsx
├── stories/
│   ├── StoryCard.tsx
│   ├── StoryEditor.tsx
│   ├── ApprovalControls.tsx
│   └── SessionSummary.tsx
├── history/
│   ├── SessionList.tsx
│   └── SessionDetail.tsx
├── layout/
│   ├── AppHeader.tsx
│   └── ProjectSelector.tsx
└── settings/
    └── ProfileForm.tsx

lib/
├── supabase/
│   ├── client.ts                     # Browser (anon) client
│   ├── server.ts                     # Server (service-role) client
│   └── types.ts                      # Generated Supabase types
├── jira/
│   ├── client.ts                     # Jira REST API wrapper (server-only)
│   ├── oauth.ts                      # OAuth token exchange + refresh logic
│   └── field-mapping.ts              # Story → Jira issue field mapping (single module)
├── llm/
│   ├── requesty.ts                   # Requesty API client (server-only)
│   └── prompts/                      # Versioned prompt templates
│       ├── requirements.ts
│       ├── sprint.ts
│       ├── meeting.ts
│       └── ac-enrichment.ts
├── audio/
│   └── transcribe.ts                 # Server-side audio transcription via Requesty
├── schemas/
│   ├── story.ts                      # Zod schema for generated story shape
│   ├── session.ts                    # Zod schema for generation session
│   └── jira.ts                       # Zod schema for Jira API responses
└── utils/
    └── session-summary.ts            # Pure function: compute story count + total points

workflows/                            # n8n workflow JSON exports
├── requirements-generation.json
├── sprint-generation.json
├── meeting-generation.json
└── ac-enrichment.json

supabase/
└── migrations/                       # All schema changes as migration files

tests/
├── unit/                             # Vitest unit tests
│   ├── lib/
│   └── components/
└── e2e/                              # Playwright E2E tests
    ├── generate.spec.ts
    ├── review-approve.spec.ts
    ├── jira-push.spec.ts
    └── history.spec.ts
```

**Structure Decision**: Single Next.js App Router repository. Server-only modules (`lib/jira/`, `lib/llm/`, `lib/audio/`) are never imported by client components — enforced by the `"use server"` boundary. All external API calls (Jira, n8n, Requesty) happen in Route Handlers or Server Actions only.
