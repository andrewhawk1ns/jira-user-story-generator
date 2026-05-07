<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Coding Standards & Best Practices

## File & Folder Organisation (Domain-Driven)

Group code by **feature / domain**, not by technical type.

```
app/
  (auth)/          # auth domain — pages and layouts
  (app)/           # app shell — authenticated pages and layouts
  api/
    generate/      # generation domain — API routes
    jira/          # jira domain — API routes
components/
  generate/        # generation domain — UI components
  layout/          # shared layout components
  ui/              # generic, stateless primitives (shadcn)
lib/
  jira/            # jira domain — client, oauth, field mapping
  llm/             # llm domain — requesty client, prompts
  schemas/         # shared zod schemas
  supabase/        # supabase domain — client, server, types
  utils/           # pure utility functions
```

Rules:
- Co-locate a component's helpers, hooks, and types in the same folder.
- `components/ui/` contains only stateless, generic primitives — no domain logic.
- Shared types live in `lib/schemas/`. Component-local types stay in the component file.
- Never reach across domain boundaries directly — go through `lib/` interfaces.

---

## React & Next.js Component Rules

### Server vs Client

- Default to **Server Components**. Add `'use client'` only when the component needs browser APIs, event handlers, or React state.
- Never import a client component into a server component that renders on every request without wrapping it in `Suspense`.
- Data fetching in Server Components must use `async/await` directly — no `useEffect` data fetching.

### Component shape

- One component per file. File name matches the exported component name (PascalCase).
- Props interface defined at the top of the file, immediately before the component.
- Destructure all props in the function signature.

```tsx
// ✅
interface StoryCardProps {
  story: GeneratedStory
  onSelect: (id: string) => void
}

export function StoryCard({ story, onSelect }: StoryCardProps) { … }

// ❌
export function StoryCard(props: any) {
  const story = props.story
  …
}
```

---

## Function Design

### Self-documenting names

- Functions are named for **what they do**, not how they do it.
- Boolean-returning functions are prefixed `is`, `has`, `can`, or `should`.
- Event handlers are prefixed `handle`.

```tsx
// ✅
function handleCreateTicket() { … }
function isContentFlagged(result: ClassifierResult) { … }
function canSubmitForm(requirements: string) { … }
function fetchEpics(projectKey: string) { … }

// ❌
function doStuff() { … }
function check() { … }
function process(data: unknown) { … }
```

### No `else` blocks

Use **early returns**, **guard clauses**, and **ternaries** instead of `else`. This keeps the happy path at the lowest indentation level.

```tsx
// ✅ — early return / guard clause
async function handleCreateTicket() {
  if (!story || !selectedProject || creatingTicket) return

  const pts = storyPointsMap[story.id] ?? story.story_points
  …
}

// ✅ — ternary for conditional rendering
{creatingTicket
  ? <Loader2 className="animate-spin" />
  : <ExternalLink />
}

// ❌ — else block
async function handleCreateTicket() {
  if (story && selectedProject && !creatingTicket) {
    …
  } else {
    return
  }
}
```

### Single responsibility

Every function does exactly one thing. If a function needs a comment to explain a section, extract that section into a named function.

```tsx
// ✅
const acStrings = normaliseAcceptanceCriteria(story.acceptance_criteria)
const effectiveLabels = resolveLabels(story)
const linkPayload = resolveLinkPayload(story, dependencies)

// ❌
// Build AC strings
const acStrings = story.acceptance_criteria.map(…)
// Build labels
const effectiveLabels = story.labels.length > 0 ? story.labels : ['user-story', …]
```

---

## State Management

- Keep state as **local as possible**. Lift only when two siblings genuinely need the same value.
- Derived values are **computed inline or in a `useMemo`** — never stored in state.
- Group closely related state into a single object rather than multiple individual `useState` calls when they always update together.

```tsx
// ✅ — derived, not stored
const canGenerate = requirements.trim().split(/\s+/).filter(Boolean).length >= 10

// ❌ — redundant state
const [wordCount, setWordCount] = useState(0)
const [canGenerate, setCanGenerate] = useState(false)
```

- Never call `setState` synchronously inside a `useEffect` body — use event handlers or compute the value inline instead.

---

## Hooks

- Custom hooks are extracted when stateful logic is reused across two or more components, or when a single component's hook section exceeds ~30 lines.
- Custom hooks are named `use<Domain><Noun>` (e.g. `useEpicSelector`, `useTicketSearch`).
- A hook that fetches data accepts the query parameters it needs and returns `{ data, isLoading, error }`.

---

## API Routes (`app/api/`)

- One concern per route file. If a route handler exceeds ~80 lines, extract helper functions into `lib/`.
- Always validate incoming request bodies with Zod at the top of the handler before touching any business logic.
- Return consistent error shapes: `{ error: string }` with an appropriate HTTP status code.
- Use `NextResponse.json(…, { status })` — never `new Response(JSON.stringify(…))`.

```ts
// ✅
const body = GenerateRequestSchema.safeParse(await req.json())
if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
```

---

## TypeScript

- No `any`. Use `unknown` at system boundaries and narrow with Zod or type guards.
- Prefer `type` over `interface` for local shapes. Use `interface` only for public contracts that may be extended.
- Avoid non-null assertion (`!`) — use nullish coalescing (`??`) or optional chaining (`?.`) instead.
- All async functions that can throw are wrapped in try/catch with typed error handling.

---

## Styling (Tailwind)

- No inline `style` props — use Tailwind classes exclusively.
- Conditional classes use the `cn()` utility from `lib/utils.ts`.
- Repeated class combinations (3+ classes used together in 2+ places) are extracted into a named variable or a `cva` variant.

---

## Avoid

| Pattern | Why |
|---|---|
| `useEffect` for data fetching in client components | Use Server Components or React Query instead |
| `else` blocks | Use early returns and guard clauses |
| `any` type | Undermines type safety |
| Storing derived state | Creates sync bugs |
| `setState` inside `useEffect` body | Causes cascading renders |
| Comments explaining *what* code does | Rename the function/variable instead |
| Barrel `index.ts` re-exports inside domain folders | Adds indirection without benefit at this scale |
