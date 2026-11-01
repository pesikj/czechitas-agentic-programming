# Lecture readiness and content issue reporting

Date: 1 November 2026 · Status: approved by the user

## Intent and scope

Give administrators a view of material readiness and a way to report problems directly from a lecture. Reports become GitHub issues in the configured content repository. The application keeps no internal report, issue history or issue database record.

This applies to every course in the existing content repository. Existing learner access, public lectures, exercises and publishing rules continue to work independently of readiness. Readiness does not gate access to a lecture.

## Approaches

The options discussed were a server-side GitHub token and a GitHub App. The user selected the token: it fits the current single content repository and avoids installation management. A GitHub App could suit a future service supporting multiple repository owners, but is outside this feature.

Statuses live in `lecture.yaml`, as selected by the user; there is no website status editor or separate status table. The existing content publishing process carries status updates to the website.

## Lecture statuses

`status` is optional in `lecture.yaml`. Accepted values and proposed Czech labels:

| YAML value | Meaning | UI label |
|---|---|---|
| `ready` | Ready | Připraveno |
| `in-progress` | In progress | Rozpracováno |
| `not-started` | Not started | Nezahájeno |
| `unknown` | Status unknown | Stav neznámý |

Omitting the field means `unknown`, as requested by the user. Explicit `unknown` is also valid. An invalid value is a content validation error. A saved content snapshot created before this feature, with no status property, also reads as unknown without requiring republishing.

Only administrators see status labels, next to each lecture link on the course home page. Use visible text; color may supplement the label. Learners and signed-out visitors see no status label or reporting controls. Status metadata may remain in the existing internal published snapshot; the prohibition on database records applies to reports.

## Reporting interaction

On every part of an `in-progress` lecture, administrators see an Add comment button (proposed label: `Přidat připomínku`). No report button is shown for ready, not-started or unknown lectures.

The button stays at the viewport's bottom-right during scrolling, above the existing command bar and clear of page controls on desktop and mobile. Opening it displays a labeled modal with a plain textarea accepting GitHub-flavored Markdown, a Save comment button (`Uložit připomínku`), and Cancel (`Zrušit`). A formatting toolbar and Markdown preview are outside the initial scope.

When opening the modal, capture the current selection before moving focus. If it is wholly within the lecture's rendered material, prefill the textarea with the selected visible text as a Markdown blockquote followed by blank space for the comment. Preserve line breaks and quote every line. Do not try to reconstruct the original Markdown formatting. Ignore selections from navigation, input fields, saved exercise answers or other page controls. With no valid selection, start with an empty textarea. The admin can edit or remove the prefilled quote.

The modal manages keyboard focus, supports Escape/cancel and returns focus to the button. Cancelling a nonempty draft requires confirmation before discarding it (designer proposal). The draft otherwise exists only in the current page's memory, with no browser persistence.

Submit requires non-whitespace text. Disable submission while it is pending. On success, show a clickable link to the newly created issue and prevent resubmitting that successful draft. On failure retain the draft and show a useful error. Closing a pending modal must not enable another submission of the same pending draft.

## GitHub issue

Use a server endpoint protected by the existing authenticated admin checks and same-origin request protection. It rechecks the lecture's current status and accepts reports only for `in-progress`; hiding the button alone is insufficient. Resolve course, lecture and part against the current content model. Derive the reporter email from the authenticated session and repository identity from server configuration, never client input.

Proposed generated title: `[Content] <lecture title> / <part title>`. The issue body includes:

- The submitted Markdown, including any selected quote.
- Reporting administrator's email address, added by the server.
- Course, lecture and part titles and ids.
- Absolute link to the lecture part on the website, constructed from `APP_BASE_URL` and the canonical course route.
- Repository-relative source file and the displayed published revision SHA. Include a source permalink at that SHA when available; preview mode explicitly says no published revision is available.

Carry the page revision in the request and reject a stale submission when published content has changed, retaining the draft and asking the admin to reload. This keeps the quote and source metadata tied to the version actually reviewed. In preview mode, report the source path and preview context without promising immutable source attribution.

The server uses `CONTENT_REPO_TOKEN` for the configured GitHub content repository. Support the existing GitHub HTTPS and SSH repository URL forms; do not derive an arbitrary outbound host from request data. GitHub Enterprise support is outside scope. Missing credentials, a non-GitHub content URL, disabled issues or unavailable GitHub must produce a recoverable reporting error without preventing lecture reading.

Token permissions: Contents read, Issues read/write and Metadata read, scoped to the content repository. The token account must also have repository access sufficient to assign issues. Keep the token on the server and out of errors and logs. Apply a bounded request size, a GitHub timeout and the existing rate-limit conventions. Exact limits and endpoint naming are left to implementation.

## Assignment

The user prefers dynamically assigning to the content repository owner. Read repository metadata: if the owner is a personal account, use that login. An organization cannot itself be an assignee. **Designer proposal:** use `pesikj` for organization-owned repositories, retaining the originally requested assignee as the fallback.

Check the selected user is assignable before creating the issue, and verify the assignee in the creation response. If the selected user is not assignable, create the report unassigned and show the resulting issue link with an assignment warning. Never lose a valid report solely because assignment is unavailable. This fallback behavior is a designer proposal for approval.

## Persistence and failure boundaries

No report table, outbox, local issue history or report-specific audit entry. Existing accounts and content snapshots continue using the database as today. Avoid logging the report body or reporter email in application logs.

Do not automatically retry issue creation: a timeout can occur after GitHub has created the issue. On an ambiguous network failure, retain the draft and advise checking the repository before retrying, with a repository issues link. Exactly-once delivery across reloads or network failures is not promised without persistent deduplication, which is outside scope.

## Acceptance and implementation touchpoints

- Content schema, types and loader accept all four statuses; omitted status and legacy snapshots resolve to unknown; invalid values fail validation.
- Both course home routes show status labels only to admins. Readiness does not change content access or public visibility.
- Every part of an in-progress lecture has the admin report control; other roles and statuses cannot submit, including through direct endpoint requests.
- Valid material selection prefills a Markdown quote; unrelated selections and answer fields do not. Reports without a selection work.
- A successful save creates a Markdown issue in the configured content repository with the reporter email, page link and source context, assigns it according to the rule above and returns the issue link. No report is written to the database.
- Failed requests preserve the draft, pending submissions cannot be duplicated by repeated clicks, stale content is handled explicitly, and assignment failure is reported separately from successful creation.
- Modal focus, keyboard operation and layout remain usable with the existing command bar and on mobile.

Expected changes: content loader/validator/types, shared home and part views, a reporting component/script, a server GitHub client and protected endpoint. Update content contract, admin guide, environment configuration guidance and representative fixture content. Verify content defaults and validation, endpoint authorization and GitHub behavior with mocked API responses, and the browser selection/modal flow with relevant accessibility checks. Real GitHub issue creation is reserved for an explicitly requested smoke test.

## Left to the builder

Exact Czech wording, badge colors, component structure, request limits and rate-limit thresholds, timeout duration and internal API naming. Follow the existing Astro SSR, TypeScript, content publishing and authentication conventions. No product code is authorized by approval of this draft alone; implementation follows the approved design and implementation plan.
