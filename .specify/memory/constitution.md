# User Story Generator Constitution

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 |
| UI Components | shadcn/ui (Radix primitives + Tailwind CSS) |
| Forms | React Hook Form + Zod (`@hookform/resolvers`) |
| Validation | Zod |
| Client State / Server State | TanStack Query v5 |
| Backend / Data | Supabase (Postgres, Auth, Storage) + `@supabase/ssr` |
| Workflow Orchestration | n8n |
| LLM Access | Requesty (or other approved tooling) |
| Integration | Jira REST API |
| Language | TypeScript (strict mode) |
| Unit Testing | Vitest |
| E2E Testing | Playwright |
| Formatting | Prettier + `eslint-config-prettier` |

## Design Authority

All frontend screens **must** be implemented to match the approved Figma files:

- **Screens** (canonical layouts): https://www.figma.com/design/pb5r9TrS0n5bXq85t2tsm5/user-story-generator?node-id=0-1&p=f&t=1hd54ceRsBOl8FfS-0
- **Implemented screens** (current designs): https://www.figma.com/design/pb5r9TrS0n5bXq85t2tsm5/user-story-generator?node-id=1-297&t=1hd54ceRsBOl8FfS-0
- **Design guidelines** (colors, typography, spacing, components): https://www.figma.com/design/pb5r9TrS0n5bXq85t2tsm5/user-story-generator?node-id=1-1594&t=1hd54ceRsBOl8FfS-0

Deviating from the Figma design requires documented approval and a Figma update before or alongside implementation.

## Core Principles

### I. Next.js 16 Reality First
- All implementation decisions must align with the currently installed framework behavior in this repository (Next.js 16.x), not older ecosystem assumptions.
- Before introducing new framework-level patterns, review local framework documentation under `node_modules/next/dist/docs/` and follow deprecation guidance.
- App Router conventions (`app/` directory, server/client component boundaries, metadata API) are authoritative.
- Prefer React Server Components for data-fetching; add `"use client"` only when browser APIs or interactivity demand it.
- **Caching is a first-class concern**: every `fetch` call, `unstable_cache` / `cacheTag` / `cacheLife` usage, and Route Handler response must explicitly declare its caching and revalidation strategy — no implicit or accidental caching.
- Use the Next.js full-route cache, data cache, and router cache layers deliberately; document the chosen strategy (e.g. `revalidate`, `no-store`, `tags`) in a comment alongside the call site.
- Invalidate the data cache via `revalidateTag` or `revalidatePath` from Server Actions or Route Handlers after mutations — never rely on time-based revalidation alone for user-facing data.
- **React 19 hooks**: prefer `useActionState` (replaces `useFormState`), `useFormStatus`, `useOptimistic`, and `use()` for resource/promise unwrapping over hand-rolled state equivalents wherever applicable.
- New features (`useTransition` enhancements, async transitions, `use(Context)` in conditionals) must be understood before use — verify behavior against the installed React version.

### II. Type Safety Is Mandatory
- TypeScript `strict` mode is non-negotiable; no feature is complete with unresolved type errors.
- Avoid `any` unless justified with a short inline comment and a follow-up task to remove it.
- Public data contracts (Supabase row types, API request/response shapes, Jira payloads, LLM prompt/response schemas) must be explicit types generated or declared from source.
- Use Supabase-generated types (`supabase gen types typescript`) — never hand-author database types.

### III. Design Fidelity with shadcn/ui
- Use shadcn/ui components as the primary building block for all UI; do not introduce a second component library.
- Compose components from the Figma design guidelines node before building bespoke alternatives.
- Tailwind utility classes must align with the design token values (colors, spacing, radii) defined in the Figma design guidelines.
- New shadcn components are added via `pnpm dlx shadcn@latest add <component>` — do not manually copy primitives.

### IV. Supabase Data & Auth
- All Supabase access in server context uses the service-role client only in Server Actions or Route Handlers; the anon client is used in client components.
- Use `@supabase/ssr` for cookie-based session management in the App Router — this is required for auth to function correctly with SSR.
- Row-Level Security (RLS) is enabled and policies are defined for every table that holds user data — no exceptions.
- Storage uploads must validate MIME type and file size server-side before accepting.
- Auth is managed exclusively through Supabase Auth; do not introduce a second auth system.
- Database migrations are tracked in version control (`supabase/migrations/`); never mutate production schema outside a migration file.

### V. n8n Workflow Orchestration
- n8n handles all multi-step automation (e.g., LLM prompt chaining, Jira ticket creation, webhook triggers).
- Workflows must be exported as JSON and committed to the repository under `workflows/`.
- Credentials are stored in n8n's credential vault — never hardcoded in workflow nodes.
- Workflows expose well-defined webhook or REST trigger endpoints; the Next.js app communicates with n8n only through those documented interfaces.

### VI. LLM Access via Approved Tooling
- All LLM calls are routed through Requesty (or explicitly approved alternatives) — no direct vendor SDK calls in application code.
- Prompt templates are stored as version-controlled files or database rows, not inline strings.
- LLM responses are parsed and validated with an explicit schema before any downstream action.
- Costs and usage must be observable; include model, token counts, and latency in structured logs.

### VII. Jira Integration
- Authentication to Jira uses **OAuth 2.0 (3-legged flow)**; users grant consent and the system exchanges the code for an access token and refresh token on the server — no personal API tokens or hardcoded credentials.
- OAuth tokens (access + refresh) are stored **server-side only** (e.g. encrypted in Supabase, associated with the user's session); they must never be sent to the browser or logged.
- All Jira REST API calls happen exclusively in server-side code (Server Actions or Route Handlers) using the user's OAuth access token; the token is refreshed automatically when expired before the request is retried.
- Required OAuth scopes must be declared explicitly in the application registration and in `README.md` (minimum: `read:jira-user`, `read:jira-work`, `write:jira-work`).
- Store only non-secret OAuth configuration in environment variables (`JIRA_BASE_URL`, `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_REDIRECT_URI`); document each in `README.md` and `.env.example`.
- Map internal user story fields to Jira issue fields explicitly; keep the mapping in a single shared module.
- Handle Jira API errors gracefully with actionable user-facing messages (including expired token prompts); log the full error server-side.

### VIII. Forms, Validation and Schema
- All forms use **React Hook Form**; shadcn/ui form components scaffold around it — do not use uncontrolled native forms or a second form library.
- All data shapes (form inputs, API request/response, LLM outputs, Jira payloads) are declared as **Zod schemas** and validated at every boundary.
- Use `@hookform/resolvers/zod` to connect form validation to the shared Zod schema — define the schema once and reuse it for both client and server validation.
- `z.infer<typeof Schema>` is the canonical TypeScript type for any Zod-validated shape; do not duplicate the type definition manually.

### IX. Client-side Server State with TanStack Query
- Use **TanStack Query v5** (`@tanstack/react-query`) for client-component data fetching, background refetches, polling (e.g. Jira status), and optimistic updates.
- TanStack Query is the client-side cache layer; Next.js data cache (RSC/`fetch`) is the server-side layer — use each in its appropriate context, never mix concerns.
- Query keys must be structured arrays that encode all cache dimensions (e.g. `['stories', projectId]`); document the key structure in the module.
- Mutations must call `queryClient.invalidateQueries` or use optimistic updates via `useMutation`'s `onMutate`/`onSettled` — do not manually refetch after mutations.

### X. Testable Behavior Over Incidental UI
- Every user story must produce verifiable acceptance criteria that map to tests or deterministic manual checks.
- Business logic (LLM parsing, Jira mapping, story formatting) is isolated into pure functions and unit-tested independently of the UI.
- Unit tests use **Vitest**; E2E tests use **Playwright**.
- Regressions must be prevented with targeted tests for the changed behavior.
- Playwright tests cover critical user flows end-to-end (e.g. generate story → review → push to Jira).

### XI. Accessibility and Content Clarity by Default
- UI changes must preserve keyboard usability, semantic HTML, ARIA roles, and readable copy.
- shadcn/ui components carry Radix accessibility primitives — do not override or strip ARIA attributes.
- Forms and interactive controls must include clear labels, validation feedback, and error states.
- New UX must prioritize clarity for non-technical users authoring or refining user stories.

### XII. Keep It Simple, Ship in Vertical Slices
- Prefer the smallest complete slice that delivers user value end-to-end.
- Avoid speculative abstractions and premature architectural complexity.
- Refactors are encouraged when they reduce complexity without changing external behavior.

## Technical Standards

- Quality gate for merge readiness: `pnpm lint`, `pnpm format:check`, and `pnpm build` must pass with zero errors.
- **Prettier** enforces consistent formatting; configure via `.prettierrc` and add `eslint-config-prettier` to disable conflicting ESLint rules.
- New production dependencies require a short rationale in the related spec/PR.
- All environment variables must be documented in `README.md` with description, required/optional status, and example values.
- Secrets are never committed; `.env.local` is gitignored and a `.env.example` file is kept up to date.
- Structured logging (JSON-serialisable entries including `level`, `message`, `service`, `timestamp`) is required for all server-side operations.

## Workflow and Review Process

- Work begins from a clear spec with explicit user value and acceptance criteria.
- Implementation follows this order: spec → plan → tasks → code.
- Pull requests/reviews must verify:
	- Constitution principle compliance.
	- Figma design fidelity for any UI changes.
	- Acceptance criteria coverage.
	- No unresolved lint/type/build errors.
	- RLS policies present for any new Supabase tables.
	- Environment variables documented if added.
	- Appropriate test coverage or documented rationale when tests are deferred.
- Breaking behavior changes require a migration note in the spec or PR description.

## Governance

- This constitution supersedes conflicting local habits and ad hoc practices.
- Amendments require:
	- A documented reason for change.
	- Version update per semantic versioning rules below.
	- Update of affected templates/workflow docs when applicable.
- Versioning rules:
	- MAJOR: incompatible governance or principle removals/redefinitions.
	- MINOR: new principle/section or materially expanded guidance.
	- PATCH: wording clarifications that do not change intent.
- Compliance checks are required during planning, implementation, and review.

**Version**: 1.5.0 | **Ratified**: 2026-05-02 | **Last Amended**: 2026-05-03
