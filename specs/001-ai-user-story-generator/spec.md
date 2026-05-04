# Feature Specification: AI User Story Generator

**Feature Branch**: `001-ai-user-story-generator`
**Created**: 2026-05-02
**Status**: Draft
**Designs**: https://www.figma.com/design/pb5r9TrS0n5bXq85t2tsm5/user-story-generator?node-id=1-297&t=1hd54ceRsBOl8FfS-0
**Input**: User description: "An internal AI-assisted tool that converts unstructured requirement inputs into standardised, Jira-ready user stories with acceptance criteria, metadata suggestions, traceability, and direct Jira integration with a lightweight review and approval workflow."

---

## User Scenarios & Testing *(mandatory)*

<!--
  User stories are ordered by priority. Each story is independently testable and delivers
  standalone value. Together they form the full AI User Story Generator experience.
-->

### User Story 1 – Ingest Requirements and Generate User Stories (Priority: P1)

A product manager or business analyst provides unstructured requirement input via typed/pasted text or recorded audio. They may optionally associate the input with a Jira epic. The tool analyses the input and returns a set of structured, Jira-ready user stories in the standard "As a [role], I want [action], so that [benefit]" format, each with a title, description, and draft acceptance criteria in Given/When/Then format. Multiple input languages are supported.

**Why this priority**: This is the core value proposition of the tool. Without this, no other story is useful. It directly addresses the problem of time-consuming, inconsistent manual story writing.

**Independent Test**: Can be fully tested by pasting a sample requirements paragraph and verifying that the output contains at least one well-formed user story with title, description, and at least one Given/When/Then acceptance scenario — without any Jira account or approval workflow.

**Acceptance Scenarios**:

1. **Given** a user has pasted or typed unstructured requirements text (minimum 50 words), **When** they submit it for generation, **Then** the system returns one or more user stories, each with a title, a user story statement ("As a…"), and at least two acceptance criteria in Given/When/Then format within 30 seconds.
2. **Given** a user records audio input, **When** the recording is submitted, **Then** the system transcribes the audio and uses the transcription as the requirements source, producing stories with the same quality as text input.
3. **Given** a user selects a Jira epic before generating, **When** stories are generated, **Then** each story is linked to that epic and the epic context is used to improve story relevance.
4. **Given** a user submits requirements in a supported non-English language, **When** stories are generated, **Then** the output stories are returned in the same language as the input.
5. **Given** a user submits an empty or extremely short input (fewer than 10 words), **When** they attempt to generate stories, **Then** the system displays a clear validation message explaining that more detail is required and does not call the generation service.
6. **Given** the generation service is unavailable, **When** a user submits requirements, **Then** the system displays a user-friendly error message and does not lose the user's input.

---

### User Story 2 – Review, Edit, and Approve Generated Stories (Priority: P2)

After stories are generated, the user can review each story individually, edit the title, description, acceptance criteria, and suggested metadata (priority, labels, story points) inline, and mark stories as approved or rejected before any external action is taken. Rejected stories are excluded from downstream processing. Approved stories are queued for Jira creation.

**Why this priority**: Human oversight is a core safety requirement of the experiment. No story should reach Jira without deliberate review. This story enables the "lightweight review and approval workflow" stated in the brief.

**Independent Test**: Can be fully tested by generating a set of stories, editing one field on one story, approving some and rejecting others, and confirming that only approved stories remain in the confirmed list — without a Jira connection.

**Acceptance Scenarios**:

1. **Given** stories have been generated, **When** the user views the results, **Then** each story is displayed with its title, user story statement, acceptance criteria, and editable metadata fields (priority, labels, story points estimate).
2. **Given** a user edits the title of a generated story, **When** they save the change, **Then** the updated title is immediately reflected in the UI and persists for the session.
3. **Given** a user has reviewed all generated stories, **When** they approve a subset and reject the rest, **Then** only the approved stories are available for Jira submission; rejected stories are visibly excluded.
4. **Given** a user has not reviewed all stories, **When** they attempt to push to Jira, **Then** the system prompts them to complete the review before proceeding.

---

### User Story 3 – Push Approved Stories to Jira (Priority: P3)

After approving stories, the user selects a target Jira project and pushes the approved stories directly to Jira as new issues. Each issue is created with the title, description, acceptance criteria, priority, and labels derived from the review step. The user receives confirmation with links to the created Jira issues.

**Why this priority**: Jira integration closes the loop from requirement to backlog ticket. Without it, the tool is a generation aid only and requires manual copy-paste, reducing its value proposition.

**Independent Test**: Can be tested end-to-end by approving at least one story and confirming a Jira issue is created in the target project with the correct title and description, and that a link to the created issue is surfaced in the UI.

**Acceptance Scenarios**:

1. **Given** a user has at least one approved story and a valid Jira project selected, **When** they confirm the push, **Then** each approved story is created as a Jira issue with the correct title, description, acceptance criteria in the description body, priority, and labels.
2. **Given** stories have been pushed, **When** the push completes, **Then** the UI displays a success confirmation with a clickable link to each created Jira issue.
3. **Given** a Jira API error occurs during push (e.g. invalid project key, permission denied), **When** the error is returned, **Then** the system displays an actionable error message identifying which stories failed, and the user's approved story list is preserved so they can retry.
4. **Given** the same input has previously been processed and pushed to Jira, **When** a user attempts to push again without changes, **Then** the system warns the user of potential duplicate issues before proceeding.

---

### User Story 4 – Generate Acceptance Criteria for an Existing Incomplete Story (Priority: P4)

A user can paste an existing incomplete or vague user story (lacking or weak acceptance criteria) into the tool and receive enriched Given/When/Then acceptance criteria generated from that story alone. Additionally, the user can search existing Jira tickets and pull in one or more as reference context to inform the generated acceptance criteria.

**Why this priority**: Addresses the "Generating acceptance criteria for incomplete stories" use case explicitly stated in the brief. Valuable as a standalone utility for teams with existing backlogs.

**Independent Test**: Can be tested by pasting a single-sentence user story and confirming the tool returns at least two distinct, testable acceptance criteria in Given/When/Then format without requiring a full document.

**Acceptance Scenarios**:

1. **Given** a user pastes a single user story statement (with no acceptance criteria), **When** they request enrichment, **Then** the system returns at least two Given/When/Then acceptance criteria that are logically derived from the story statement.
2. **Given** the generated acceptance criteria are returned, **When** the user reviews them, **Then** each criterion is unambiguous, independently testable, and free of implementation details.
3. **Given** a user searches for Jira tickets by keyword or issue key, **When** results are returned, **Then** the user can select one or more tickets whose content is included as additional context for acceptance criteria generation.
4. **Given** a user has selected one or more Jira tickets as context, **When** acceptance criteria are generated, **Then** the output reflects requirements from both the pasted story and the selected Jira ticket content.

---

### User Story 5 – Generate Sprint Stories from an Existing Sprint (Priority: P5)

A user can select an existing Jira sprint and use it as the context for generating stories. The tool produces a set of user stories scoped to that sprint. Upon completion, a summary is displayed showing the total number of stories created and the total story points across all generated stories.

**Why this priority**: Addresses the "Preparing draft stories for sprint planning" use case. The sprint selector and summary give teams an immediate sense of scope and velocity impact without manually counting tickets.

**Independent Test**: Can be tested by selecting an available sprint, generating stories, and confirming the summary panel shows an accurate count of stories and a summed story points total.

**Acceptance Scenarios**:

1. **Given** a user selects an existing Jira sprint from a list of available sprints in their project, **When** they submit input for generation, **Then** stories are generated in the context of that sprint and are ready to be pushed to it.
2. **Given** stories have been generated for a sprint, **When** the generation completes, **Then** the system displays a summary showing the total number of stories created and the sum of all suggested story points.
3. **Given** a user generates stories from meeting notes, **When** the generation completes, **Then** the same summary (story count and total story points) is displayed for the meeting-notes session.

---

### User Story 6 – Configure Default Jira Project and Change Active Project (Priority: P6)

A user can set a default Jira project in their profile settings, which pre-populates the active project on every session. A project selector in the application header allows the user to switch to a different project at any time without going to settings.

**Why this priority**: Reduces repetitive configuration for users who primarily work in one project while keeping the active project easily changeable for users who work across multiple projects.

**Independent Test**: Can be tested by setting a default project in profile settings, reloading the app, and confirming the header selector shows that project pre-selected; then changing the project in the header and confirming the change is reflected immediately.

**Acceptance Scenarios**:

1. **Given** a user navigates to their profile settings, **When** they select a default Jira project from their accessible projects and save, **Then** the next time they open the app the header project selector is pre-populated with that project.
2. **Given** a user has a default project set, **When** they select a different project from the header selector, **Then** the active project updates immediately and all subsequent generation and push actions target the newly selected project.
3. **Given** a user has no default project set, **When** they open the app, **Then** the header project selector is empty and they are prompted to select a project before generating stories.

---

### User Story 7 – View Generation History and Traceability (Priority: P7)

A user can view a history of their previous generation sessions, including the original source input and the stories produced. They can reopen a past session to review or re-export results.

**Why this priority**: Addresses the traceability requirement stated in the brief. Supports audit and consistency goals. Lower priority than core generation and Jira push but required for the experiment's traceability success criterion.

**Independent Test**: Can be tested by completing at least two generation sessions and confirming both appear in a history list with the source input and story count, and that clicking into one surfaces the original input and all generated stories.

**Acceptance Scenarios**:

1. **Given** a user has completed at least one generation session, **When** they navigate to history, **Then** they see a chronological list of sessions each showing the date, session type (requirements / sprint / meeting / AC enrichment), a truncated preview of the source input, and the number of stories generated.
2. **Given** a user opens a past session from history, **When** the session loads, **Then** they see the original source input alongside all stories that were generated in that session, including their approval status.

---

### Edge Cases

- What happens when the input contains sensitive or personally identifiable information (PII)?
- What happens when the LLM returns a malformed or empty response?
- How does the system behave when the Jira project key is valid but the user has read-only permissions?
- What is the maximum input length, and how is oversized input communicated to the user?
- How are duplicate story titles handled within a single generation session?
- What happens if the user closes the browser mid-review before pushing to Jira?
- What happens when audio recording fails (microphone permission denied, recording too short, or transcription fails)?
- What happens when the user selects a Jira epic that has been deleted or archived since their last session?
- What is the behaviour when a selected sprint has already been completed or closed?
- What happens when a Jira ticket search for AC context returns no results?
- How is the story points total displayed when some stories have no suggested story points estimate?
- What happens if the user's default Jira project is removed from their accessible projects (e.g. permission revoked)?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept unstructured requirements input via typed/pasted text (minimum 10 words) or recorded audio, and return one or more structured user stories in "As a [role], I want [action], so that [benefit]" format.
- **FR-002**: Each generated user story MUST include a title, a user story statement, and at least two acceptance criteria in Given/When/Then format.
- **FR-003**: The system MUST suggest metadata for each story including priority level, relevant labels, and a story points estimate.
- **FR-004**: The system MUST display a clear validation message when input is below the minimum length threshold and prevent generation from proceeding.
- **FR-005**: The system MUST maintain traceability between each generated story and the source input from which it was derived.
- **FR-006**: Users MUST be able to edit the title, description, acceptance criteria, priority, labels, and story points of any generated story before approval.
- **FR-007**: Users MUST be able to individually approve or reject each generated story; only approved stories may be pushed to Jira.
- **FR-008**: The system MUST prevent pushing to Jira until all generated stories have been reviewed (approved or rejected).
- **FR-009**: Users MUST authenticate via Jira OAuth 2.0 (3-legged flow) before accessing the tool; authentication grants the system the permissions needed to create issues on the user's behalf.
- **FR-010**: The system MUST allow users to select a target Jira project (from projects accessible under their OAuth token) and create approved stories as Jira issues with correct field mapping.
- **FR-021**: The system MUST accept audio recordings as requirements input, transcribe the audio server-side, and use the transcription as the source for story generation.
- **FR-022**: Users MUST be able to optionally select a Jira epic before generating requirements stories; when selected, the epic details are included as generation context.
- **FR-023**: The system MUST support requirements input and story output in multiple languages; the output language must match the input language.
- **FR-024**: Users MUST be able to search Jira tickets by keyword or issue key when generating acceptance criteria and select one or more tickets as additional context.
- **FR-025**: Users MUST be able to select an existing Jira sprint when generating sprint stories; the sprint context is used to scope the generated output.
- **FR-026**: Upon completion of sprint story generation or meeting notes story generation, the system MUST display a summary showing the total number of stories created and the sum of all suggested story points.
- **FR-027**: Users MUST be able to set a default Jira project in their profile settings; this project is pre-selected in the header project selector on every subsequent session.
- **FR-028**: A project selector in the application header MUST allow users to change the active Jira project at any time; the change must take effect immediately for all subsequent actions in the session.
- **FR-011**: The system MUST display a success confirmation with links to created Jira issues after a successful push.
- **FR-012**: The system MUST display an actionable error message and preserve the user's approved story list if a Jira push fails.
- **FR-013**: The system MUST warn the user before pushing stories that appear to duplicate a previous push from the same input.
- **FR-014**: The system MUST allow a user to paste a single existing user story and generate enriched acceptance criteria without a full document; selected Jira tickets may be included as additional context.
- **FR-015**: The system MUST persist a history of generation sessions including source input, session type, generated stories, and approval status.
- **FR-016**: Users MUST be able to review any past session from history, viewing the original input and all stories produced.
- **FR-017**: The system MUST handle LLM service unavailability gracefully with a user-facing error message and without losing input data.
- **FR-018**: The system MUST NOT fabricate stories without a traceable basis in the provided source input.
- **FR-019**: When a user's Jira OAuth token expires, the system MUST prompt re-authentication without losing in-progress session data.
- **FR-020**: The system MUST handle Jira OAuth authorisation errors (e.g. user denies consent, insufficient scopes) with a clear explanation and a path to retry.

### Key Entities

- **Generation Session**: A single end-to-end run; holds the source input, session type (requirements / sprint / meeting / AC enrichment), timestamp, list of generated stories, and overall status (in-review, approved, pushed).
- **Source Input**: The raw unstructured text or audio transcription provided by the user; linked to exactly one session.
- **User Story**: A generated artifact with title, user story statement, acceptance criteria, metadata (priority, labels, story points), approval status, and an optional Jira issue reference.
- **Jira Issue**: An external ticket created in Jira; referenced by its issue key and URL, linked back to the user story that produced it.
- **Jira Epic**: An optional Jira epic selected by the user to scope requirements story generation; its summary and description are passed as context to the LLM.
- **Jira Sprint**: An existing Jira sprint selected by the user to scope sprint story generation; its name and goal are passed as context to the LLM.
- **Session Summary**: A computed aggregate displayed after sprint or meeting story generation, showing total story count and total suggested story points.
- **User Profile**: Stores user preferences including the default Jira project; persisted server-side per authenticated user.
- **User**: An authenticated individual identified via Jira OAuth 2.0; their OAuth access token is used for all Jira API calls on their behalf.
- **OAuth Token**: A short-lived Jira access token (plus refresh token) obtained after the OAuth 3-legged flow; stored securely server-side and never exposed to the browser.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from providing unstructured requirements (text or audio) to having a reviewed, Jira-ready set of user stories in under 5 minutes for a typical input (300–600 words or equivalent audio).
- **SC-002**: 90% of generated stories are assessed by reviewers as "clear and actionable" without requiring manual rewriting before approval.
- **SC-003**: 100% of pushed Jira issues correctly reflect the approved story title, description, and acceptance criteria with no data loss or truncation.
- **SC-004**: Zero stories are generated that contain requirements or assertions with no basis in the source input (hallucination rate = 0% as assessed in manual review of 10 test sessions).
- **SC-005**: The system processes a 600-word input and returns generated stories within 30 seconds under normal conditions.
- **SC-006**: Users complete the end-to-end flow (input → generate → review → push) without requiring support or documentation reference on their second session.
- **SC-007**: All past sessions are retrievable via history for at least the duration of the experiment.
- **SC-008**: The sprint/meeting story generation summary correctly reflects the actual number of stories displayed and the arithmetic sum of their suggested story points in 100% of sessions tested.

---

## Assumptions

- The tool is for internal use only; multi-tenant isolation or enterprise SSO beyond Jira OAuth is out of scope for this experiment.
- Authentication and authorisation are handled exclusively via Jira OAuth 2.0 (3-legged); users must have a valid Jira account and grant the required OAuth scopes during the OAuth flow.
- A user's Jira identity (obtained from the OAuth token) serves as the application identity; no separate user registration is required.
- Multiple input languages are supported; the specific set of supported languages is determined by the LLM's capabilities and is documented at release.
- The LLM will be accessed via Requesty or another approved internal proxy; direct vendor API keys are not used in application code.
- Story point estimates are suggestions only; the tool does not enforce or integrate with Jira's configured estimation scheme.
- File/document upload (e.g. PDF, DOCX) may be deferred; text paste is the primary input method for v1.
- Jira read access (searching issues, fetching epics, fetching sprints) is required in addition to issue creation; the required OAuth scopes must cover both read and write operations.
- Session history is scoped to the authenticated user; cross-user visibility is out of scope.
- The tool is a proof of concept; production-grade SLAs, disaster recovery, and compliance certifications are out of scope.
