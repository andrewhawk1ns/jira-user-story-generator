---
description: "Task list for AI User Story Generator feature implementation"
---

# Tasks: AI User Story Generator

**Input**: Design documents from `specs/001-ai-user-story-generator/`
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Data Model**: [data-model.md](data-model.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US#]**: Which user story this task belongs to
- File paths are relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and environment configuration

- [x] T001 Configure shadcn/ui — run `pnpm dlx shadcn@latest init`, select Custom theme, then overwrite `:root`/`.dark`/`@theme inline` blocks in `app/globals.css` with the Figma Make theme (`--primary: #030213`, `--muted: #ececf0`, `--radius: 0.625rem`)
- [x] T002 [P] Install shadcn components — `pnpm dlx shadcn@latest add button input textarea select dialog card badge label toast`
- [x] T003 [P] Install remaining runtime deps — `pnpm add @supabase/supabase-js @supabase/ssr @tanstack/react-query @tanstack/react-query-devtools react-hook-form @hookform/resolvers zod`
- [x] T004 [P] Install dev deps — `pnpm add -D vitest @vitejs/plugin-react playwright @playwright/test`
- [x] T005 [P] Install linting/formatting dev deps — `pnpm add -D prettier eslint-config-prettier stylelint stylelint-config-standard stylelint-config-standard-scss @pandacss/stylelint-plugin` (note: Tailwind CSS v4 uses PostCSS, not SCSS — use `stylelint-config-standard` with CSS syntax)
- [x] T006 Configure Prettier — create `.prettierrc` at root (`{ "semi": false, "singleQuote": true, "trailingComma": "es5", "printWidth": 100 }`); create `.prettierignore` excluding `.next/`, `node_modules/`, `pnpm-lock.yaml`; extend `eslint.config.mjs` to include `eslint-config-prettier` as the final config entry so ESLint and Prettier never conflict; add `"format": "prettier --write ."` and `"format:check": "prettier --check ."` scripts to `package.json`
- [x] T007 [P] Configure Stylelint — create `stylelint.config.mjs` at root extending `stylelint-config-standard`; add rules to allow Tailwind v4 `@theme`, `@utility`, and `@apply` at-rules (add them to `customSyntax` or ignore them via `ignoreAtRules`); add `"lint:css": "stylelint \"app/**/*.css\" \"components/**/*.css\""` script to `package.json`
- [x] T008 Create `.env.example` at repository root documenting all required env vars listed in `specs/001-ai-user-story-generator/quickstart.md`
- [x] T009 [P] Configure Vitest — add `vitest.config.ts` at root and a `test` script in `package.json`
- [x] T010 [P] Configure Playwright — add `playwright.config.ts` at root and a `test:e2e` script in `package.json`

**Checkpoint**: Toolchain ready — `pnpm lint`, `pnpm format:check`, `pnpm lint:css`, and `pnpm build` all pass on the empty app.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story work can begin

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T011 Create Supabase migrations for all tables in `supabase/migrations/` — `user_profiles`, `jira_tokens`, `generation_sessions`, `generated_stories` with all columns, indexes, check constraints, and RLS policies as specified in `specs/001-ai-user-story-generator/data-model.md`
- [x] T012 [P] Generate Supabase TypeScript types — run `pnpm supabase gen types typescript --linked > lib/supabase/types.ts`
- [x] T013 [P] Create Supabase browser client — `lib/supabase/client.ts` (anon key, cookie-based session via `@supabase/ssr`)
- [x] T014 [P] Create Supabase server client — `lib/supabase/server.ts` (service-role, server-only, reads cookies from Next.js headers)
- [x] T015 Create Zod schemas for all external boundaries — `lib/schemas/story.ts`, `lib/schemas/session.ts`, `lib/schemas/jira.ts`
- [x] T016 [P] Create Jira OAuth helpers — `lib/jira/oauth.ts` (PKCE generation, token exchange with Atlassian, token refresh logic, AES-256-GCM encryption/decryption using `TOKEN_ENCRYPTION_KEY`)
- [x] T017 [P] Create Jira REST API client — `lib/jira/client.ts` (server-only wrapper; reads encrypted token from `jira_tokens`, decrypts, injects `Authorization: Bearer` header; calls Atlassian REST API v3)
- [x] T018 [P] Create Jira field mapping module — `lib/jira/field-mapping.ts` (maps `generated_stories` row → Jira issue create payload per `specs/001-ai-user-story-generator/contracts/jira-field-mapping.md`, including ADF description builder and issue link dependency calls)
- [x] T019 [P] Create Requesty LLM client — `lib/llm/requesty.ts` (server-only; posts to Requesty API using `REQUESTY_API_KEY`; validates response with Zod story schema)
- [x] T020 [P] Create session summary utility — `lib/utils/session-summary.ts` (pure function `computeSessionSummary(stories)` returning `{ storyCount, totalStoryPoints }`; null story points count as 0)
- [x] T021 Create TanStack Query provider wrapper — `components/providers/QueryProvider.tsx` (wraps app with `QueryClientProvider`; included in `app/(app)/layout.tsx`)
- [x] T022 Create root app shell layout — `app/(app)/layout.tsx` (AppHeader with ProjectSelector, QueryProvider, Supabase session guard redirecting to `/login` if unauthenticated)
- [x] T023 [P] Create AppHeader component — `components/layout/AppHeader.tsx` (nav links, ProjectSelector placeholder, user display name)
- [x] T024 [P] Create login page — `app/(auth)/login/page.tsx` (server component; shows "Connect with Jira" button that links to `/api/auth/jira`)

**Checkpoint**: Foundation ready — authenticated app shell renders; database tables exist with RLS; library modules compile without errors. User story implementation can now begin.

---

## Phase 3: User Story 1 – Ingest Requirements and Generate User Stories (Priority: P1) 🎯 MVP

**Goal**: A user can paste requirements text or record audio and receive generated user stories with acceptance criteria within 30 seconds.

**Independent Test**: Paste a 100-word requirements paragraph, submit, verify at least one story is returned with a title, user story statement, and two Given/When/Then criteria — no Jira account needed.

### Implementation

- [ ] T025 Implement Jira OAuth initiation route — `app/api/auth/jira/route.ts` (GET; generate PKCE verifier/challenge; store verifier in encrypted cookie; redirect to Atlassian authorization URL)
- [ ] T026 Implement Jira OAuth callback route — `app/api/auth/callback/route.ts` (GET; validate state; exchange code + PKCE verifier for tokens via `lib/jira/oauth.ts`; fetch `/rest/api/3/myself`; upsert `user_profiles` + `jira_tokens`; create Supabase Auth session; redirect to `/`)
- [ ] T027 [P] [US1] Create versioned LLM prompt templates — `lib/llm/prompts/requirements.ts`, `lib/llm/prompts/sprint.ts`, `lib/llm/prompts/meeting.ts`, `lib/llm/prompts/ac-enrichment.ts` (each exports a typed function building the system + user message from session context)
- [ ] T028 [P] [US1] Implement server-side audio transcription — `lib/audio/transcribe.ts` (downloads audio from Supabase Storage; sends to Requesty transcription endpoint; returns transcript string; deletes Storage object after success)
- [ ] T029 [US1] Implement generate Route Handler — `app/api/generate/route.ts` (POST; validate request body with Zod; create `generation_sessions` row with status `generating`; if `audioPath` present, transcribe via `lib/audio/transcribe.ts`; trigger n8n webhook with payload per `specs/001-ai-user-story-generator/contracts/n8n-webhooks.md`; return `{ sessionId, status: "generating" }`)
- [ ] T030 [US1] Implement n8n callback Route Handler — `app/api/generate/callback/route.ts` (POST; validate `X-Webhook-Secret`; Zod-parse body; upsert stories into `generated_stories` with `generated_*` immutable fields; update session status to `ready` or `error`)
- [ ] T031 [P] [US1] Implement session status polling route — `app/api/sessions/[id]/status/route.ts` (GET; returns `{ status, errorMessage? }`; no-store)
- [ ] T032 [P] [US1] Build RequirementsForm component — `components/generate/RequirementsForm.tsx` (`"use client"`; React Hook Form + Zod; text area with 10-word minimum validation; Epic selector dropdown; language selector; submit triggers `POST /api/generate`)
- [ ] T033 [P] [US1] Build AudioRecorder component — `components/generate/AudioRecorder.tsx` (`"use client"`; MediaRecorder API; records to WebM; uploads to Supabase Storage `audio-uploads` bucket via signed upload URL; passes returned Storage path to parent form)
- [ ] T034 [P] [US1] Build EpicSelector component — `components/generate/EpicSelector.tsx` (`"use client"`; TanStack Query `useQuery` fetching `GET /api/jira/epics?projectKey=...`; combobox with search; optional)
- [ ] T035 [US1] Build home page — `app/(app)/page.tsx` (server component; renders `<RequirementsForm>` and `<AudioRecorder>`; on generation start, transitions to polling/results view)
- [ ] T036 [US1] Implement status polling in home page — use TanStack Query `useQuery` with `refetchInterval: 2000` against `GET /api/sessions/[id]/status`; stop polling when status is `ready` or `error`
- [ ] T037 [US1] Implement Jira projects route — `app/api/jira/projects/route.ts` (GET; server-only; calls `lib/jira/client.ts`; returns project list; revalidates every 300 seconds)
- [ ] T038 [US1] Implement Jira epics route — `app/api/jira/epics/route.ts` (GET; requires `projectKey` query param; server-only; revalidates every 60 seconds)

**Checkpoint**: End-to-end — paste text → generate → poll → stories displayed on screen. No Jira push or review needed yet.

---

## Phase 4: User Story 2 – Review, Edit, and Approve Generated Stories (Priority: P2)

**Goal**: After generation, users can edit any field on any story and mark each as approved or rejected.

**Independent Test**: Generate stories, edit one story's title, approve two stories, reject one — confirm only approved stories remain in the submission queue.

### Implementation

- [ ] T039 [P] [US2] Build StoryCard component — `components/stories/StoryCard.tsx` (displays title, user story statement, AC list, metadata badges; shows `generated_*` originals alongside editable fields; `"use client"`)
- [ ] T040 [P] [US2] Build StoryEditor component — `components/stories/StoryEditor.tsx` (`"use client"`; React Hook Form + Zod; inline editing of title, userStoryStatement, acceptanceCriteria, priority, labels, storyPoints, blockedByIssueKeys, blocksIssueKeys; saves via `PATCH /api/sessions/[id]/stories/[storyId]`)
- [ ] T041 [P] [US2] Build ApprovalControls component — `components/stories/ApprovalControls.tsx` (`"use client"`; approve/reject buttons per story; shows running approved count; "Push to Jira" disabled until all stories reviewed)
- [ ] T042 [US2] Implement story PATCH route — `app/api/sessions/[id]/stories/[storyId]/route.ts` (PATCH; auth-guard; Zod-validate partial update; reject any update to `generated_*` fields; update DB row; return updated story)
- [ ] T043 [US2] Implement session detail route — `app/api/sessions/[id]/route.ts` (GET; returns full session + all stories; auth-guard; no-store)
- [ ] T044 [US2] Wire review UI into the home page results view — after polling status becomes `ready`, fetch full session detail and render `<StoryCard>` + `<StoryEditor>` + `<ApprovalControls>` for each story; TanStack Query `useQuery` for session detail

**Checkpoint**: Generate → review → approve/reject flow works end-to-end. Push button visible but disabled until all stories reviewed.

---

## Phase 5: User Story 3 – Push Approved Stories to Jira (Priority: P3)

**Goal**: Approved stories are created as Jira issues; user sees links to each created issue.

**Independent Test**: Approve at least one story, click push, confirm a Jira issue appears in the target project with the correct title and description, and a link is shown in the UI.

### Implementation

- [ ] T045 [US3] Implement Jira push route — `app/api/jira/push/route.ts` (POST; receives `sessionId`; loads approved stories; checks for duplicate push warning; calls `lib/jira/client.ts` to create each issue per `lib/jira/field-mapping.ts`; creates issue link calls for `blockedByIssueKeys`/`blocksIssueKeys` after issue creation; updates `jira_issue_key` + `jira_issue_url` on each story row; updates session status to `pushed`; returns `{ pushed[], failed[], linkErrors[] }`)
- [ ] T046 [P] [US3] Build push confirmation UI — add confirmation dialog to `ApprovalControls` (shows approved count, warns if previously pushed, confirm/cancel); on success, display result list with clickable Jira issue links; on partial failure, show per-story error detail
- [ ] T047 [US3] Implement duplicate push warning — in `app/api/jira/push/route.ts`, check if session `status === "pushed"` before proceeding and return a `409` with a `{ warning: "already_pushed" }` body; client shows a confirmation dialog before re-pushing

**Checkpoint**: Full end-to-end flow: generate → review → push → Jira issue created with link displayed.

---

## Phase 6: User Story 4 – AC Enrichment for Existing Stories (Priority: P4)

**Goal**: A user can paste a single incomplete story and receive enriched Given/When/Then acceptance criteria; they can optionally search Jira tickets as additional context.

**Independent Test**: Paste a one-sentence user story, click enrich, confirm at least two distinct Given/When/Then criteria are returned without requiring a full document.

### Implementation

- [ ] T048 [US4] Implement Jira ticket search route — `app/api/jira/search/route.ts` (GET; `q` query param min 2 chars; optional `projectKey`; calls `lib/jira/client.ts` JQL search; returns matching issues with key + summary + description; no-store)
- [ ] T049 [P] [US4] Build AC Enrichment page — `app/(app)/ac-enrichment/page.tsx` (server component shell rendering the AC enrichment form)
- [ ] T050 [P] [US4] Build AC enrichment form — `components/generate/AcEnrichmentForm.tsx` (`"use client"`; React Hook Form + Zod; textarea for the single story statement; ticket search combobox using TanStack Query + `GET /api/jira/search`; multi-select for context tickets; submit triggers `POST /api/generate` with `type: "ac_enrichment"` and selected `contextTicketIds`)
- [ ] T051 [US4] Wire AC enrichment results view — reuse `<StoryCard>` + `<StoryEditor>` + `<ApprovalControls>` on `app/(app)/ac-enrichment/page.tsx` to display and review enriched criteria

**Checkpoint**: AC Enrichment page: paste story → (optionally search tickets) → enrich → review enriched criteria.

---

## Phase 7: User Story 5 – Sprint Story Generation (Priority: P5)

**Goal**: A user selects an existing Jira sprint, generates stories scoped to that sprint, and sees a summary of story count and total points.

**Independent Test**: Select an available sprint, generate stories, verify the summary panel shows the correct count and summed story points.

### Implementation

- [ ] T052 [US5] Implement Jira sprints route — `app/api/jira/sprints/route.ts` (GET; `projectKey` required, `state` optional (default `active,future`); calls `lib/jira/client.ts`; revalidates every 60 seconds)
- [ ] T053 [P] [US5] Build SprintSelector component — `components/generate/SprintSelector.tsx` (`"use client"`; TanStack Query `useQuery` fetching `GET /api/jira/sprints?projectKey=...`; combobox; required for sprint session type)
- [ ] T054 [P] [US5] Build Sprint generation page — `app/(app)/sprint/page.tsx` (server component shell; renders requirements form configured for `type: "sprint"` with `SprintSelector` instead of `EpicSelector`)
- [ ] T055 [P] [US5] Build SessionSummary component — `components/stories/SessionSummary.tsx` (`"use client"`; calls `computeSessionSummary()` from `lib/utils/session-summary.ts`; displays story count and total story points; shown after sprint or meeting generation completes; null story points displayed as `—`)
- [ ] T056 [US5] Wire SessionSummary into sprint results view — after polling status is `ready`, render `<SessionSummary>` above the story list on `app/(app)/sprint/page.tsx`

**Checkpoint**: Sprint generation: select sprint → generate → summary shows correct story count and total points.

---

## Phase 8: User Story 5 (continued) – Meeting Notes Story Generation

**Goal**: A user can paste or dictate meeting notes and generate stories; the same session summary is shown.

**Independent Test**: Paste meeting transcript, generate stories, confirm summary panel shows count and total points.

### Implementation

- [ ] T057 [US5] Build Meeting Notes generation page — `app/(app)/meeting/page.tsx` (server component shell; renders requirements form configured for `type: "meeting"` with no epic/sprint selector; `<SessionSummary>` shown after generation)

**Checkpoint**: Meeting notes → generate → summary works identically to sprint flow.

---

## Phase 9: User Story 6 – Default Project and Header Project Selector (Priority: P6)

**Goal**: Users can set a default Jira project in settings; a project selector in the header lets them switch projects at any time.

**Independent Test**: Set a default project in settings, reload the app, confirm the header shows that project pre-selected; change it via the header and confirm subsequent routes reflect the new choice.

### Implementation

- [ ] T058 [US6] Implement profile GET route — `app/api/profile/route.ts` (GET; returns user profile from `user_profiles`; auth-guard; no-store)
- [ ] T059 [P] [US6] Implement profile PATCH route — `app/api/profile/route.ts` (PATCH; validates `defaultJiraProjectKey` and `defaultJiraProjectName`; updates `user_profiles`; returns updated row)
- [ ] T060 [P] [US6] Build Settings page — `app/(app)/settings/page.tsx` (server component that pre-fetches user profile; renders `<ProfileForm>`)
- [ ] T061 [P] [US6] Build ProfileForm component — `components/settings/ProfileForm.tsx` (`"use client"`; React Hook Form + Zod; project selector dropdown populated from `GET /api/jira/projects`; saves via `PATCH /api/profile`; TanStack Query mutation with optimistic update)
- [ ] T062 [US6] Build ProjectSelector component — `components/layout/ProjectSelector.tsx` (`"use client"`; TanStack Query `useQuery` for projects list; combobox pre-populated with default project from user profile; on change, updates a React context / query key so all downstream generation forms reflect the new project immediately)
- [ ] T063 [US6] Wire ProjectSelector into AppHeader — `components/layout/AppHeader.tsx` renders `<ProjectSelector>` on all authenticated pages; ProjectSelector state propagates to all generation form components via context

**Checkpoint**: Settings flow → set default → reload app → header pre-populated → header change updates active project.

---

## Phase 10: User Story 7 – Generation History and Traceability (Priority: P7)

**Goal**: Users can view a chronological list of past generation sessions and open any session to see its original input and all stories.

**Independent Test**: Complete two generation sessions, navigate to history, confirm both appear with date, type, input preview, and story count; open one and confirm the original input and all stories are visible.

### Implementation

- [ ] T064 [US7] Implement session list route — `app/api/sessions/route.ts` (GET; paginated `limit`/`offset`; returns session list with preview fields; auth-guard; no-store)
- [ ] T065 [P] [US7] Build SessionList component — `components/history/SessionList.tsx` (`"use client"`; TanStack Query `useInfiniteQuery` for paginated sessions; each row shows date, type badge, source input preview, story count; links to `app/(app)/history/[sessionId]`)
- [ ] T066 [P] [US7] Build history list page — `app/(app)/history/page.tsx` (server component shell; renders `<SessionList>`)
- [ ] T067 [P] [US7] Build SessionDetail component — `components/history/SessionDetail.tsx` (`"use client"`; fetches `GET /api/sessions/[id]`; displays source input text or transcription; renders all stories via `<StoryCard>` in read-only mode; shows Jira links for pushed stories)
- [ ] T068 [US7] Build history session detail page — `app/(app)/history/[sessionId]/page.tsx` (server component; pre-fetches session detail for SSR; renders `<SessionDetail>`)

**Checkpoint**: History list and session detail fully functional. Pushed stories show Jira links.

---

## Phase 11: Polish and Cross-Cutting Concerns

**Purpose**: Error handling, accessibility, OAuth edge cases, and quality gate

- [ ] T069 Implement global error handling for Route Handlers — add `try/catch` wrappers in all Route Handlers returning consistent `{ error: string, code: string }` JSON on failure
- [ ] T070 [P] Implement OAuth token refresh — in `lib/jira/oauth.ts`, add refresh logic: if `token_expires_at` is within 5 minutes, call Atlassian refresh endpoint and update `jira_tokens` before returning token to caller
- [ ] T071 [P] Implement OAuth re-auth prompt — when a Jira API call returns `401`, return a `401` from the Route Handler with `{ code: "jira_auth_expired" }`; client intercepts and redirects to `/login` without losing session state
- [ ] T072 [P] Implement audio upload error handling — in `AudioRecorder.tsx`, handle microphone permission denial, recording timeout (10 min), and file size limit (15 MB) with user-facing toast messages
- [ ] T073 [P] Add loading states — add skeleton loaders and `useFormStatus` pending states to all forms and result views so the UI communicates progress during network operations
- [ ] T074 [P] Accessibility audit — verify all interactive elements have accessible labels; all shadcn/Radix primitives used as-is; no custom ARIA overrides; test with keyboard navigation on the main generation flow
- [ ] T075 Add Vitest unit tests — `tests/unit/lib/session-summary.test.ts` (covers `computeSessionSummary` with null points, empty array, all points set), `tests/unit/lib/field-mapping.test.ts` (covers priority mapping, ADF structure, issue link payload shape), `tests/unit/lib/oauth.test.ts` (covers encryption/decryption round-trip)
- [ ] T076 [P] Add Playwright E2E test — `tests/e2e/generate.spec.ts` (paste text → generate → poll → stories visible; validates no Jira required for this test)
- [ ] T077 Run `pnpm lint && pnpm build` — fix all lint errors; confirm production build succeeds with no type errors

**Checkpoint**: All quality gates pass. App is ready for internal PoC testing.

---

## Dependencies

```
Phase 1 (Setup)
  └── Phase 2 (Foundation)
        ├── Phase 3 (US1 — Requirements + Audio)
        │     ├── Phase 4 (US2 — Review/Approve)
        │     │     └── Phase 5 (US3 — Push to Jira)
        │     ├── Phase 6 (US4 — AC Enrichment)
        │     ├── Phase 7 (US5 — Sprint Generation)
        │     └── Phase 8 (US5 — Meeting Notes)
        └── Phase 9 (US6 — Default Project + Header)
              └── Phase 10 (US7 — History)

Phase 11 (Polish) — can begin per-story after each story phase is complete
```

US4, US5 (sprint), US5 (meeting), and US6 can be implemented in parallel after US1 is complete.

---

## Parallel Execution Examples

**After T009 (Foundation complete)**:
- T010–T008 (US1) in one branch
- T010–T008 (US6 profile/settings) in another branch

**After T008 (US1 complete)**:
- T009–T008 (US2 Review/Approve)
- T009–T009 (US4 AC Enrichment)
- T010–T008 (US5 Sprint)
- T009 (US5 Meeting)

**Within any story phase**, all tasks marked `[P]` can run simultaneously.

---

## Implementation Strategy

**MVP = Phase 3 (US1) + Phase 4 (US2) + Phase 5 (US3)**

This delivers the core loop: generate → review → push to Jira. All other user stories add value incrementally. Aim to have the MVP working end-to-end before proceeding to US4–US7.

**Total tasks**: 74
**Tasks per story**: US1=14, US2=6, US3=3, US4=4, US5=5 (sprint) + 1 (meeting) = 6, US6=6, US7=5
**Setup/Foundation/Polish**: 7 + 14 + 9 = 30
**Parallel opportunities**: ~35 tasks marked [P]
