# Lecture Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Show admins lecture readiness and let them submit Markdown feedback as assigned GitHub issues directly from in-progress lecture pages.

**Architecture:** Carry optional authored status through the existing content model and snapshots. An admin-only JSON endpoint resolves trusted lecture metadata and calls a small server-side GitHub client; an accessible dialog holds drafts only in page memory. No report database records or schema migrations.

**Tech Stack:** Existing Astro SSR, TypeScript, Zod, native fetch and HTML dialog, Vitest, Playwright and axe.

**Spec:** `docs/superpowers/specs/2026-11-01-lecture-review-design.md` (approved).

## Global Constraints

- Accepted status values: `ready`, `in-progress`, `not-started`, `unknown`; omission means `unknown`, including old published snapshots.
- Status labels and reporting controls are admin-only. Only `in-progress` permits reports. Readiness does not change lecture access.
- Status is maintained in `lecture.yaml` and reaches production through existing publishing.
- Use `CONTENT_REPO_TOKEN` server-side for the repository in `CONTENT_REPO_URL`; never accept a target repository, reporter email or issue assignee from the browser.
- Issues contain Markdown, reporter email, canonical page link, source path and published revision context. Assign personal owners dynamically; organization fallback is `pesikj`. Failed assignment must not discard a created report.
- No internal report persistence, outbox, issue history, report-specific audit entry, or browser storage; no automatic retry of issue creation.
- Czech UI text and English code/docs; existing mobile, public lecture, command bar and accessibility behavior must remain usable.
- No real GitHub issue creation without an explicitly requested smoke test. Unit tests mock GitHub.

## Review Focus

1. Older snapshots lacking status must show unknown immediately, without requiring a new publication (Task 1).
2. Host-confusion URLs and redirects must never receive the GitHub token (Task 2).
3. Publication while a report dialog is open must reject stale submission and preserve the draft (Tasks 3–4).
4. Selection crossing exercise answers or navigation must never prefill private/unrelated text (Task 4).
5. Timeout after GitHub accepts a report must not cause an automatic retry or an incorrectly definite failure message (Tasks 2–4).

## File map

- `src/lib/content/types.ts`, `validate.ts`, `load.ts`: status input and normalized model.
- New `src/lib/lecture-status.ts`: effective status and Czech label helpers shared by rendering and authorization.
- `src/server/content/snapshot-store.ts`: normalize legacy stored lectures while loading.
- `src/views/HomeView.astro`: admin-only status labels.
- New `src/server/content/github-issues.ts`: repository parsing, metadata/assignee lookup and single issue creation.
- New `src/server/content/report-issue.ts`: trusted content resolution and report preparation.
- New `src/pages/admin/pripominky.ts`: bounded, authorized JSON submission endpoint.
- New `src/components/ContentReport.astro`, `src/scripts/content-report.ts`, `src/lib/content-report.ts`: dialog markup, browser lifecycle and selection/quote helpers.
- `src/views/PartView.astro`, `src/styles/theme.css`: integration and viewport layout.
- `.env.example`, `src/server/config.ts`, `docs/content-contract.md`, `docs/admin-guide.md`, `docs/operations.md`: configuration comments and usage guidance.
- Tests and fixtures named in the tasks below; no new test framework or runtime dependency.

## Task 1: Carry lecture status through publishing and render it for admins

**Files:** Modify content types/validator/loader/snapshot store, HomeView and theme CSS; create `src/lib/lecture-status.ts`; extend `tests/content.test.ts`, `tests/provider.test.ts`, `tests/integration/publish.test.ts`; update `docs/content-contract.md` and representative e2e fixtures.

**Interfaces:** Export `LectureStatus = 'ready' | 'in-progress' | 'not-started' | 'unknown'` from content types and add required normalized `Lecture.status: LectureStatus`. Export `lectureStatus(lecture: { status?: LectureStatus }): LectureStatus` and `lectureStatusLabel(status: LectureStatus): string` from `src/lib/lecture-status.ts`. Labels are `Připraveno`, `Rozpracováno`, `Nezahájeno`, `Stav neznámý` respectively.

- [x] Write failing loader tests for every explicit value, missing value, and invalid value (`schema-invalid`, no model). Assert omitted status becomes `unknown` and existing public visibility remains unchanged.
- [x] Add a publish integration regression that strips status from a stored model, loads that published snapshot, and asserts normalized `unknown` without fetching or republishing. Add round-trip checks for `in-progress` across both courses.
- [x] Run `npx vitest run --project unit tests/content.test.ts tests/provider.test.ts` and the targeted publish regression with `--project integration`; confirm the new assertions fail for missing status support.
- [x] Implement schema enum/optional field, loader normalization and snapshot-load normalization. Update typed lecture literals in existing tests as needed. Keep stored input types honest about missing legacy status rather than claiming every stored lecture already has it.
- [x] Render text labels beside home-page lecture links only when `Astro.locals.user?.role === 'admin'`. Do not alter `visibleModel`, lecture availability, search or navigation commands.
- [x] Set representative e2e lectures to ready, in-progress and not-started, retain an omitted status case and put an in-progress lecture in the additional course. Document the optional field and publishing behavior.
- [x] Re-run the targeted tests and `npm run check`; expect all checks to pass. Commit the status deliverable.

## Task 2: Create GitHub issues with dynamic assignment

**Files:** Create `src/server/content/github-issues.ts`, `tests/github-issues.test.ts`; update token comments in `src/server/config.ts` and `.env.example` and permissions guidance in `docs/operations.md`.

**Interfaces:** Export `GithubRepository = { owner: string; repo: string; htmlUrl: string }`, `parseGithubRepository(url: string): GithubRepository | undefined`, `CreatedContentIssue = { url: string; number: number; assignmentWarning?: string }`, and `createContentIssue(input: { repository: GithubRepository; token: string; title: string; body: string }, fetcher?: typeof fetch): Promise<CreatedContentIssue>`. Export a typed `GithubIssueError` with `kind: 'configuration' | 'unavailable' | 'ambiguous'` and safe Czech user message.

- [x] Write parser tests asserting HTTPS, `git@github.com:owner/repo.git` and `ssh://git@github.com/owner/repo.git` resolve to the same repository. Assert local paths, non-GitHub hosts, lookalike hosts, credentials embedded in HTTPS URLs, query/fragment, extra path segments and malformed names are rejected.
- [x] Write mocked-fetch tests: personal owner selected; organization uses `pesikj`; unassignable candidate creates once without assignees and returns a warning; returned assignees missing despite a successful creation also return a warning and the issue link.
- [x] Test metadata/eligibility failure makes no creation request; timeout or network rejection during POST yields `ambiguous` and exactly one POST; explicit API rejection yields a sanitized error. A 3xx response is never followed with credentials. A malformed success payload cannot produce an arbitrary external result link.
- [x] Run `npx vitest run --project unit tests/github-issues.test.ts`; confirm failure before implementation.
- [x] Implement requests only to `https://api.github.com/repos/<encoded owner>/<encoded repo>...`, with redirect refusal, token header, JSON media type and a supported explicit API version. Set a 10-second timeout per request. Check repository owner type and issue availability, check assignee eligibility, create once, and validate the returned issue URL/number/assignees. Do not retry creation or echo GitHub response bodies to users/logs. Treat inability to determine eligibility as unavailable before creation; a definite not-assignable result is the unassigned fallback.
- [x] Document repository scoping, Contents read, Issues read/write and Metadata read, account access needed for assigning, token expiry/organization approval, and HTTPS for existing token-authenticated publishing. Parsing an SSH repository identity for issue creation does not change the existing publisher's HTTPS requirement when a token is configured.
- [x] Re-run the test file; expect PASS. Commit the GitHub client deliverable.

## Task 3: Protect submission and construct trusted report context

**Files:** Create `src/server/content/report-issue.ts`, `src/pages/admin/pripominky.ts`, `tests/content-report-endpoint.test.ts`; use existing provider, config and `RateLimiter`.

**Interfaces:** Export `ReportInput = { courseId: string; lectureId: string; partId: string; revisionSha: string | null; body: string }` and `submitContentReport(input: ReportInput, reporter: { email: string }): Promise<CreatedContentIssue>` from `report-issue.ts`. The HTTP route accepts exactly those five fields. Success JSON: `{ ok: true, issueUrl: string, assignmentWarning?: string }`; failure JSON: `{ ok: false, message: string, ambiguous?: boolean, repositoryIssuesUrl?: string }`. All responses are JSON with `Cache-Control: no-store`.

- [x] Write route tests using mocked provider/config/GitHub modules and synthetic Astro contexts. Assert absent user gets 401, learner gets 403, absent/mismatched Origin gets 403, and no blocked request calls GitHub. Use strict `Origin === new URL(APP_BASE_URL).origin` for this browser-only JSON endpoint, even though Astro also protects form posts.
- [x] Assert malformed JSON/extra fields and blank body get 400, wrong course/lecture/part gets 404, non-in-progress status gets 409, stale SHA or null/production mismatch gets 409. Test both course prefixes and preview mode (`revisionSha: null`).
- [x] Assert excessive body gets 413 both with a declared length and streamed bytes; the sixth attempt in a minute by one admin gets 429. Assert forged email/repository fields cannot affect generated output.
- [x] Assert the issue title is `[Content] <lecture title> / <part title>`, body contains authenticated email, submitted Markdown unchanged, canonical part link, all ids/titles, repository-relative file and source permalink at the published SHA. Preview has an explicit no-published-revision message and no invented SHA.
- [x] Assert an ambiguous GitHub failure returns its safe message and repository issues URL, no retry, and no report database write. Assignment warnings preserve a successful response and issue URL. Missing token/non-GitHub config produces recoverable 503.
- [x] Run `npx vitest run --project unit tests/content-report-endpoint.test.ts`; confirm the intended failures.
- [x] Implement route POST with an admin guard before reading data, strict same-origin validation, streaming 32 KiB request cap and JSON content-type check (415 otherwise), and one module-scoped `RateLimiter(5, 60_000)` keyed by admin id. Limit Markdown to 20,000 characters. Use Zod strict object parsing. Reject unsupported methods with 405.
- [x] Implement the report service using a single `getContent()` result for course/lecture/part resolution, current effective status and SHA comparison. Derive links with existing navigation helpers and `APP_BASE_URL`; escape generated metadata for Markdown while preserving report Markdown. Use fixed error classes/status mapping and omit sensitive provider/API details. Do not write a report row or audit record.
- [x] Re-run the new tests plus `npm run check`; expect PASS. Commit the submission deliverable.

## Task 4: Add selection-aware reporting dialog

**Files:** Create `src/components/ContentReport.astro`, `src/scripts/content-report.ts`, `src/lib/content-report.ts`, `tests/content-report.test.ts`, `tests/e2e/content-report.spec.ts`; modify PartView/theme CSS and `docs/admin-guide.md`.

**Interfaces:** Component props: `{ courseId: string; lectureId: string; partId: string; revisionSha: string | null }`. Form endpoint: `/admin/pripominky`, using Task 3 JSON. Export `quoteSelection(text: string): string` and `selectedMaterialText(selection: Selection | null, materialRoot: HTMLElement): string` from the browser-safe helper. Selection is read from `article.part .prose` and must exclude `.exercise-panel`, form controls and editable regions, including intersections within a partially overlapping range.

- [x] Write quote helper assertions: `quoteSelection('one\ntwo') === '> one\n> two\n\n'`; empty selection yields empty prefill. Test CRLF normalization without losing intentional blank quoted lines.
- [x] Write browser tests asserting home labels only for admins in both courses, button only for in-progress/admin, and no button for learner/public/other statuses. Use existing seeded sessions; do not skip mobile for this feature.
- [x] Test real browser selection of multiple rendered paragraphs before clicking the button: textarea contains visible text as blockquotes. Selections outside material, in a response field, or spanning an exercise panel are ignored. Keyboard opening with no selection starts blank. The captured selection survives focus moving to the button/dialog.
- [x] Browser-route mock only `/admin/pripominky` for UI success/failure tests. Assert Markdown request and page SHA, issue link rendering, assignment warning, blank submit rejection, retained text for 409 and 503, ambiguous-failure issues link, and exactly one request for repeated clicks. Hold the response to test that Escape/close cannot enable another pending submit.
- [x] Test cancellation confirmation, focus trap/return, Escape, scroll-fixed button placement above the command bar at desktop/mobile sizes, keyboard entry with the mobile textarea visible, and axe on the open dialog. Verify a canceled discard confirmation keeps the draft and dialog open.
- [x] Run `npx vitest run --project unit tests/content-report.test.ts` and `npx playwright test tests/e2e/content-report.spec.ts --project desktop-chromium --project mobile-webkit`; confirm intended initial failures.
- [x] Implement the shared view integration with an admin/effective-status guard. Pass published SHA or null. Render the dialog and a progressively enabled trigger (hidden until its script initializes); explain in a noscript message that reporting requires JavaScript, only for eligible admins.
- [x] Implement draft states `editing`, `pending`, `success`, `error`: capture a valid selection before focus changes; quote only visible selected material; preserve unsent drafts; disable close while pending; ask confirmation before discarding nonempty editing/error drafts; after success show issue link and disable repeat submission. A newly opened dialog after closing a success starts a new empty/selection draft. Submit with same-origin credentials, never auto-retry, render response messages as text and links as validated URLs.
- [x] Add responsive dialog and fixed-trigger CSS using actual command-bar height (ResizeObserver if no suitable existing layout variable), including safe-area spacing. Follow existing terminal theme and native dialog focus semantics. Keep only page-memory state; do not use existing response local-storage helpers.
- [x] Document admin-only status badges, Markdown reporting, selected quotes, included email, GitHub issue link, assignment fallback, failure recovery and no internal history.
- [x] Re-run the targeted tests and `npm run check`; expect PASS. Commit the UI deliverable.

## Task 5: Verify the complete feature and hand off

**Files:** Existing tests as needed for fixture expectations; this plan's checkboxes and approved design for completion notes only.

- [x] Run `npm test` with the existing Postgres/Mailpit development services available. Expect unit and integration suites PASS. Resolve feature regressions before continuing; report an unavailable dependency explicitly rather than claiming a pass.
- [x] Run `npm run check` and `npm run build`; both must exit 0.
- [x] Run `npm run test:e2e`; expect existing public access, both course routes, publishing, command bar and new dialog tests PASS on configured browser projects. Endpoint tests exercise real server code with mocked GitHub; browser success tests intercept the local endpoint, so they must not be reported as a real GitHub smoke test.
- [x] Review the diff for admin-only UI and endpoint guards, unchanged lecture access, no report persistence, no browser token, no sensitive logging, encoded source links and no automatic creation retries. Run `git diff --check`.
- [x] Commit any verification fixes and report changed behavior, checks actually run and any limitations. Do not deploy or create a live issue. Integration/PR handling follows the user's selected execution workflow.

## Self-review

Spec coverage: statuses and legacy storage (Task 1); repository ownership/token/assignment/error boundaries (Task 2); trusted metadata, access, stale revision, limits and persistence rules (Task 3); dialog, quote selection, cancellation, mobile and accessibility (Task 4); regression verification (Task 5). Interfaces use the same status values, request fields and result shapes across tasks. All five Review Focus conditions have an owning test. No implementation changes have been made by writing this plan.


## Execution result — 1 November 2026

Implemented using native execution from the `test` checkout. Per-task commits were omitted while Git metadata was sandbox-protected. The user subsequently requested committing the verified result on `feat/lecture-review` and opening a draft pull request. No deployment or live content-report issue was created.

Verification after independent review: 242 unit/integration tests passed; 130 browser tests passed with 18 pre-existing skips; type check clean. Production build verified separately. Review found one actual recovery gap: a lost browser response lacked an issues link. A failing browser regression now passes after supplying a validated, server-derived fallback URL. The existing global external-link handler already opens dynamic GitHub links in a new tab; a regression verifies the original draft survives checking GitHub. There are no deferred review findings.

Decisions retained: no persistent deduplication, so an administrator must check GitHub before deliberately retrying an uncertain submission; real deployed credentials still require an explicitly requested live smoke test. Progress and test evidence were recorded in the ignored `.superpowers/sdd/2026-11-01-lecture-review/` workspace and temporary test logs during execution.
