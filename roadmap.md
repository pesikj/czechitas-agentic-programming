# Czechitas Course Terminal — development roadmap

Created: 3 October 2026. Updated 3 October 2026: exercise responses and administrator reading moved to milestone 6, directly before the pilot; publishing and the remaining first-release workflows move up to milestones 4 and 5.

Source: [product-definition.md](product-definition.md). The product definition remains authoritative for requirements; this roadmap sequences their implementation.

This roadmap delivers a website for an instructor-led course. It does not define the syllabus. All milestones are planned; none are marked complete. Dates and effort estimates should be set after the application stack, content contract, and delivery capacity are known.

## Status — 5 October 2026

| Milestone | State | Evidence |
|---|---|---|
| 1–6 | Implemented | Vitest unit + integration tests (accounts, publishing, admin, responses against Postgres and Mailpit) and Playwright tests (desktop Chromium, mobile WebKit, the production build, axe in both themes) pass; see `npm test` and `npm run test:e2e`. |
| 7 | Prepared; the pilot is pending | Production image, HTTPS compose setup, Content Security Policy, health check, backup/restore (restore drill passed), operations guide, admin guide and release gate are done. Deployment, production email, the beginner pilot and the release gate need people and the production server: see `docs/pilot-checklist.md`. |

## Delivery overview

| Milestone | Outcome | Depends on |
|---|---|---|
| 1. Foundations and content contract | Agreed implementation choices and representative content | — |
| 2. Reading and command navigation | A working WebTUI learning interface | 1 |
| 3. Accounts and protected access | Invited learners can securely access materials | 1; integrate with 2 |
| 4. Manual content publishing | Admins control which repository revision is visible | 1–3 |
| 5. Complete first-release workflows | Search, bulk accounts, and account administration are ready | 3, 4 |
| 6. Exercise responses and admin reading | Learners save optional answers; admins read and export them | 2–5 |
| 7. Pilot and launch | The complete product is validated for live teaching | 1–6 |

Milestones 2 and 3 can be developed independently after the foundations are agreed. Responses come last before the pilot, so they are built on finished accounts, published content revisions, and account administration. Any interface prototype before access protection is complete must use non-sensitive sample content and remain local or otherwise restricted.

## 1. Foundations and content contract

**Outcome:** developers can implement the website without guessing the input format or account policies.

Deliverables:

- Select the application framework, database, hosting approach, and email service. Keep WebTUI (`@webtui/css`) as the selected styling library.
- Define how the separate content repository supplies lecture and part identifiers, titles, ordering, Markdown, exercise fields, images, and optional tool/operating-system alternatives.
- Define the configured repository URL and branch. Keep source content separate from learner records.
- Finalize the supported Markdown dialect and extensions. The product's proposed baseline is CommonMark plus GitHub-flavored Markdown; do not reduce support to a small formatting subset.
- Prepare representative sample content with several parts, a nested navigation structure, an image, code, a table, and an optional exercise. Include invalid samples for validation checks.
- Define records for users, invitations/recovery, the published content revision, and one current response per learner/exercise. Do not add progress or persistent-draft records.
- Resolve invitation/reset expiry, post-course access duration, and account/response deletion and retention behaviour before implementing the dependent flows.
- Define how the first administrator is provisioned, plus the support contact and ownership of content maintenance.

**Acceptance:** the sample structure can be parsed into a content model; identifiers and ordering are unambiguous; unresolved choices are documented with the implementation work they block. No syllabus is hardcoded.

## 2. Reading and command navigation

**Outcome:** a learner can browse representative materials in the intended interface.

Deliverables:

- Build the WebTUI shell, dark/light themes, readable prose area, and responsive navigation tree.
- Generate a simple shared home screen from repository content. Do not add a personalized dashboard, resume action, or completion indicators.
- Show one lecture part at a time with lecture title, part title, part number, breadcrumbs, and stable links.
- Implement `/next`, `/back`, `/home`, and `/help` using the same navigation actions as clickable/tappable suggestions. Command names remain subject to the product definition's final naming decision.
- Handle the beginning/end of a lecture, unknown commands, and missing part links clearly. Keep browser history behaviour distinct from moving to the preceding lecture part.
- Render the agreed full Markdown dialect, copyable examples, inline images, alternative text, and enlarged image viewing. Support relative asset paths and missing-image fallbacks.
- Render tool/operating-system alternatives only when the content defines them.

**Acceptance:** keyboard and pointer users can open a lecture, move both ways, return home, and open a direct part link. Long text, Czech characters, images, and code remain usable on a laptop beside an editor and on a mobile viewport. There is no progress tracking or command execution beyond website navigation.

## 3. Accounts and protected access

**Outcome:** access is available only to administrator-created active accounts.

Deliverables:

- Implement learner/admin roles, sign-in, sign-out, and administrator creation of individual accounts. Provide no self-registration.
- Automatically email each new user an invitation with a sign-in link and generated one-time password.
- Require a new password immediately after initial sign-in; prevent content access until this succeeds.
- Implement invitation sending states, failure handling, resending with replacement credentials, and recovery from interrupted activation.
- Implement **Zapomenuté heslo** with emailed, expiring, single-use reset links for existing active accounts and a neutral request confirmation.
- Protect pages, search endpoints, images, downloads, and other content assets on the server. All active learners receive the same published materials.
- Return users to a requested protected link after sign-in and any required password change.

**Acceptance:** test the complete invitation-to-content journey with a test mailbox. Used/replaced one-time passwords cannot be reused; password recovery cannot create or reactivate an account. Signed-out requests cannot retrieve course content or assets, and learners cannot use administration actions.

## 4. Administrator-triggered content publishing

**Outcome:** the administrator controls when the newest repository content becomes visible.

Deliverables:

- Add **Aktualizovat obsah** to administration, using the configured repository and branch, including for the first publication.
- Pull into a candidate revision and validate structure, identifiers, Markdown processing, and referenced assets before activation.
- Prepare navigation, pages, assets, and search data for the same revision, then activate that revision together.
- Show active revision, last successful update time, in-progress status, and success/failure details. Handle an empty installation before the first successful publication.
- Keep the previous working revision available when fetching or validation fails. Handle overlapping update requests without publishing mixed revisions.
- Preserve accounts through updates; record the revision so that saved responses (milestone 6) can refer to it. Do not fetch/publish on a schedule, repository event, or learner page visit.

**Acceptance:** a repository edit stays invisible until an admin runs the update. A successful update changes the shared content version; an invalid revision leaves current materials usable. Non-admin users cannot trigger a pull.

## 5. Complete first-release workflows

**Outcome:** routine teaching and administration tasks are covered.

Deliverables:

- Add bulk account creation from email lists with per-address results for validation, duplicates, creation, and invitation sending.
- Complete searchable account administration: email/role edits, activation states, deactivation/reactivation, administrator password reset, and confirmed deletion under the agreed retention policy (milestone 6 extends deletion to saved responses).
- Revoke existing access when required by deactivation or administrator credential reset. Prevent removal/deactivation of the last active administrator.
- Add protected search over the currently published content, linking directly to lecture parts.
- Complete useful empty, loading, and error states in learner and admin screens. Keep invitation delivery status separate from account activation.

**Acceptance:** an administrator can manage a realistic invitation list despite invalid entries and revoke a user's access. Search reflects only the active content revision.

## 6. Optional exercise responses and administrator reading

**Outcome:** learners can save short responses and administrators can read them.

Deliverables:

- Generate **Moje odpověď** fields from content definitions. All responses are optional.
- Provide multiline Markdown input, **Psát/Náhled**, and **Uložit odpověď**. Explain that saved responses are visible to administrators.
- Save explicitly to the server, retaining one current answer per learner/exercise with its published content revision (milestone 4) and timestamp. An edit replaces the saved version using last-successful-save-wins behaviour.
- Confirm success only after persistence succeeds. On failure, retain text in the open editor and allow retry.
- Offer save/discard/stay when navigating within the app with unsaved edits. Skipping an untouched exercise never blocks movement.
- Keep Enter as a newline in response editors and as command execution only in the command bar.
- Let learners reopen their saved answers. Provide an admin response list filtered by learner and exercise, with formatted answer details and save timestamps.
- Preserve saved responses when exercises move, change revision, or disappear from current navigation. Keep such records accessible through response listing/export rather than depending solely on an existing exercise page.
- Export one or all of a learner's saved responses as Markdown with exercise and field labels.
- Apply the agreed retention policy to responses when an account is deleted (account deletion itself is milestone 5).

**Acceptance:** a saved response survives sign-out and is visible to its author and an administrator, but not another learner. A revised exercise identifies an older saved response appropriately, and a previously saved answer remains accessible after a content update moves or removes its exercise. Exports preserve Markdown and identify the relevant exercises. All confirmed first-release features now have an implemented path. No autosave, persistent draft system, answer history, separate submission workflow, grading, or AI evaluation is introduced.

## 7. Pilot, operational checks, and launch

**Outcome:** the website is ready to accompany a real class.

Deliverables:

- Run a pilot with beginners using the site beside their actual terminal and editor: invitation, password change, lecture navigation, image enlargement, optional answer, explicit save, and return home.
- Run the administrator journey: invite users, read answers, publish a valid update, and recover from a failed update.
- Verify the chosen Markdown dialect across course pages, learner previews, and administrator views. Confirm embedded content cannot execute as application code.
- Check keyboard focus, screen-reader labels, contrast, browser zoom, narrow screens, and agreed desktop/mobile browsers.
- Exercise email failures, expired/reset credentials, failed response saves, and unavailable content repositories. Confirm errors do not report false success.
- Verify access boundaries across both pages and direct data/asset requests, including separation of learner responses.
- Configure production email delivery, repository access, database backups, and a documented restore/redeployment procedure. Confirm a backup can be restored before real learner data depends on it.
- Document concise admin instructions for invitations, recovery, reading answers, content updates, and support.

**Release gate:** the learner and administrator journeys pass; no known access-control or saved-answer-loss defect remains; the administrator can publish materials and handle account recovery. Launch uses an explicit administrator content update and includes no background content publishing.

## Later possibilities — outside the first release

- AI evaluation of responses, with its purpose, administrator oversight, and data handling defined before implementation.
- Content-authored self-checks, hints, and solution widgets.

Do not introduce self-paced progress, personalized dashboards, persistent drafts, real-time collaboration, mandatory answers, or cohort-specific content permissions as incidental extensions. Revisit them only through an explicit product-scope decision.

## Planning and maintenance

Implement small, reviewable changes within each milestone. Use its acceptance criteria to determine completion, and record validation evidence when marking work done. Estimate calendar dates after milestone 1; no deadline or staffing assumptions have been supplied.

Keep future roadmap changes aligned with the product definition. A roadmap task must not silently turn an optional answer into a requirement or an administrator-triggered update into automatic publishing.
