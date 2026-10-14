# Implementation decisions

Milestone 1 of `roadmap.md`, decided on 3 October 2026. Requirements come from `product-definition.md`.

## Stack

| Concern | Decision |
|---|---|
| Runtime | Node.js ≥ 22.12 (developed on 24 LTS; see `.nvmrc`) |
| Framework | Astro, server-rendered (`output: 'server'`, `@astrojs/node` standalone). Pages are HTML-first; small client scripts only for the command bar and the response editor. |
| Styling | WebTUI (`@webtui/css`) for the surrounding interface. Lecture prose gets its own reading styles. |
| Database | PostgreSQL 16 via Drizzle ORM and the `postgres` driver |
| Email | Nodemailer over SMTP, or the Brevo HTTP API when `BREVO_API_KEY` is set (hosts that block SMTP, such as Railway's Hobby plan). Locally, Mailpit is the test mailbox (http://localhost:8025). The production provider is configured in `.env.production` or the host's variables (see `operations.md`). |
| Authentication | Built in the application: database-backed sessions in an HttpOnly, Secure, SameSite=Lax cookie; argon2id password hashes (`@node-rs/argon2`, added in milestone 3). No third-party authentication service. |
| Markdown | unified/remark: CommonMark + GFM + directives, then sanitized HTML. Details in `content-contract.md`. |
| Hosting | Railway (Hobby): app from the `Dockerfile` + Railway Postgres; `railway.json`. Railway provides HTTPS. See `operations.md`. |
| Tests | Vitest (unit + integration against Postgres/Mailpit), Playwright + axe (browser, accessibility, production build) |

## Content source and storage

- The source is a git repository configured by `CONTENT_REPO_URL` and `CONTENT_BRANCH`. In development this is the sibling checkout `../czechitas-agentic-programming-content` on `main`.
- **Aktualizovat obsah** (milestone 4) fetches the branch into a temporary directory, validates it with `loadContent()`, prepares navigation, pages, images and search, stores the result in the database and switches the active revision in one step. The temporary directory is removed afterwards; the server keeps no content on disk.
- Published content is stored in the database (`content_snapshots`, `content_assets`) and served only through authenticated routes. Protected content never appears in public build output.
- Content is never fetched on a schedule, on a repository event or on a page visit.

## Policies

Confirmed by the product owner on 3 October 2026 (milestone 3). They are configurable through environment variables.

| Policy | Value | Setting |
|---|---|---|
| Invitation one-time password validity | 7 days | `INVITATION_TTL_HOURS=168` |
| Password-reset link validity | 60 minutes, single use | `PASSWORD_RESET_TTL_MINUTES=60` |
| Session length | 30 days; ended by sign-out, deactivation or a credential reset | `SESSION_TTL_DAYS=30` |
| Access after the course | Until an administrator deactivates the account (no automatic expiry) | — |
| Account deletion | Permanently removes the account **and its responses**. The confirmation offers an export first. | — |
| Deactivation | Blocks sign-in and ends sessions; keeps the account and responses | — |

## Accounts and ownership

- **First administrator**: `npm run admin:create -- <email>` (implemented in milestone 3) creates an active admin account with `must_change_password` set and sends the normal invitation. It works only from the server shell.
- **Support contact**: the `SUPPORT_EMAIL` address appears in invitation and reset emails.
- **Content maintenance**: content authors work in the content repository and validate with `npm run content:validate`.

## Open items

| Item | Blocks |
|---|---|
| Name the real support contact and content owner | Launch (`SUPPORT_EMAIL`; content owner named in the pilot checklist) |
| Choose the production SMTP provider and sender domain (SPF/DKIM) | Launch (`pilot-checklist.md`) |
| Production content repository URL and access (deploy key) | Launch (`operations.md`) |
| Run the pilot with beginners and the administrator rehearsal | Launch (`pilot-checklist.md`) |

## Learning interface (milestone 2)

- Commands: `/next`, `/back`, `/open`, `/home`, `/help`, with Czech aliases `/dalsi`, `/zpet`, `/otevrit`, `/domu`, `/napoveda`.
- `/open` takes a lecture number (`/open 2`), a lecture and part number (`/open 2.3`, a comma also works), a lecture id, or words from the title. One match opens the lecture; several matches are listed. Lecture numbers follow the current navigation order and are shown on the home page and in the sidebar. Ids stay stable when lectures are reordered, so use them in written instructions. Input is case- and diacritics-insensitive, and the leading `/` is optional. The registry is `src/lib/commands.ts`, so names can change without touching the UI.
- Code examples are classified by fence language, including the new `prompt` and `output` (see the content contract). There is no syntax highlighting for now.
- Only images referenced by the published content are served, from `/obsah/<path>`.
- Browser storage holds only per-viewer conveniences: the theme and the chosen tool/OS alternative.

## Accounts and access (milestone 3)

- **Invitation OTP:** 12 characters from an unambiguous alphabet, shown as `ABCD-EFGH-JKMN`. Case, spaces and dashes are ignored when typing. It stays usable until the learner sets a password or it expires (7 days), so an interrupted activation can be resumed. Setting the password, or a resent invitation, invalidates it. The OTP only opens the password-change page.
- **Passwords:** 10–128 characters, not the email address (or its local part), not on the built-in list of common passwords (`src/server/auth/common-passwords.ts`); no character-class rules. Stored as argon2id (19 MiB, 2 iterations).
- **Sessions:** a random token in an HttpOnly, SameSite=Lax cookie (`__Host-kurz_session` and Secure over HTTPS); only its SHA-256 hash is in the database. Expiry is 30 days and slides forward when less than half remains. Changing or resetting a password ends all of the user's sessions; deactivation blocks existing sessions immediately.
- **Sign-in errors** are identical for unknown, deactivated and wrong credentials ("Nesprávný e-mail nebo heslo."), and timing is equalised with a dummy hash check.
- **Recovery** emails a single-use link (60 minutes) only to active accounts with a password. The confirmation is always the same, so recovery cannot create, reactivate or reveal accounts.
- **Rate limits** (in memory, per server process): sign-in 10 attempts per email and address and 50 per address in 15 minutes; reset requests 3 per email and 20 per address per hour. They reset when the app restarts, and need the real client address behind the reverse proxy (milestone 7).
- **Access control** (`src/middleware.ts`): everything except sign-in, recovery, built assets, the **title page** and **public lectures** requires a session. A lecture with `public: true` in its `lecture.yaml` and the images it uses can be read signed out (`GET` only, decided from the published snapshot in `src/lib/content/visibility.ts`); visitors get a model reduced to public lectures (the title page `/` lists only those, and hides content errors), no search, and a sign-in prompt instead of the answer form. Signed-out page requests get 303 to `/prihlaseni?next=…`; images get 401. Users who must change their password reach only `/zmena-hesla`. Admin pages check the role and answer 403. Form posts rely on Astro's origin check. Behind the HTTPS proxy, Astro takes the public origin from the proxy's `X-Forwarded-*` headers (`security.allowedDomains` in `astro.config.mjs`), otherwise every post would look cross-site. Pages send `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, and signed-in pages, the title page and public lecture pages `Cache-Control: private, no-store`.
- **Email sending** is synchronous with timeouts. The admin list shows the invitation state (`sending`, `sent`, `failed` with the error) separately from activation. A failure leaves the account for a retry with **Znovu odeslat pozvánku**.
- **First administrator:** `npm run admin:create -- <email>`. Running it again for an administrator who has not activated yet resends the invitation.

## Content publishing (milestone 4)

- **Aktualizovat obsah** (`src/server/content/publish.ts`):
  1. fetches `CONTENT_BRANCH` from `CONTENT_REPO_URL` into a temporary bare repository and exports the commit with `git archive` (`src/server/content/repository.ts`);
  2. validates it and prepares navigation, every rendered page, images and the search index;
  3. in one database transaction, stores that snapshot (`src/server/content/snapshot-store.ts`), switches the active revision and deletes older snapshots;
  4. removes the temporary directory.
- Any failure leaves the previous revision active. Fetch, branch and validation errors are shown to the administrator with file and line. Runs that hang for more than 10 minutes are marked failed, and only one run can be in progress at a time (database index and in-process guard). Git never prompts for credentials.
- Every request asks the database which revision is active, so all server processes serve the same one. Each server process loads the active snapshot from the database once and keeps it in memory; images are read from the database per request. If the active revision has no snapshot (published before snapshots were stored), it is rebuilt from git by commit on the first request.
- `CONTENT_DIR` remains an optional **preview mode** for authors and tests; the admin page warns when it is on. Production must not set it.

## First-release workflows (milestone 5)

- **Bulk creation:** paste addresses separated by lines, commas, semicolons or spaces. Each address gets its own result: created (with invitation result), invalid, already exists, or repeated. Failures never stop the others.
- **Account administration:** search by email and filter by status and role; a detail page offers email/role edits, resend invitation, **Obnovit přístup** (removes the password, ends sessions, emails a new OTP with "obnovený přístup" wording), deactivate/reactivate and deletion.
- **Safeguards:** the last active administrator cannot be demoted, deactivated or deleted. Administrators cannot deactivate, delete or demote themselves. Deletion requires typing the account's email.
- **Search** (`/hledat`, the header box, `/search` command with alias `/hledat`): per-revision in-memory index of part text, code and image descriptions, ignoring case and diacritics. Every word must match. Title matches rank first, and each result shows a highlighted snippet. Signed-in only.

## Responses (milestone 6)

- **Editor:** the **Moje odpověď** panel at each `exercise` block has one Markdown textarea per field, **Psát/Náhled** (preview rendered by the server with the same sanitized dialect), and **Uložit odpověď**. It works without JavaScript (plain form post); with JavaScript it saves via `fetch` and shows success only after the server confirms. On failure the text stays and the button retries.
- **Unsaved changes:** links, commands and forms that leave the page offer save / discard / stay; untouched exercises never ask. Reloading or closing the tab uses the browser's own prompt. Nothing is autosaved or kept as a draft.
- **Storage:** one current answer per learner and exercise (last successful save wins). Up to 20,000 characters per field; empty answers are rejected. Each save records the exercise revision, the published content revision, and snapshots of lecture, part, exercise and field titles, so answers stay readable and exportable after content moves or disappears.
- **Reading:**
  - Learners see only their own answers (**Moje odpovědi**, export of all or one answer as Markdown).
  - Administrators read all answers (**Administrace → Odpovědi**, filters by learner and exercise, Markdown export).
  - Answers to a changed or removed exercise are labelled.
- **Retention:** deleting an account deletes its answers (database cascade). Deactivation keeps them. The deletion page offers an export first.

## Launch preparation (milestone 7)

- **Image:**
  - `Dockerfile`: Node 24, git/tar, unprivileged `node` user; migrations at start (`scripts/migrate.ts`); health check on `/health`.
  - Railway provides HTTPS; the app sets HSTS on HTTPS requests. `TRUST_PROXY=true` makes rate limits use the client address Railway's proxy saw.
- **Content Security Policy** (Astro `security.csp`, sent as a header):
  - scripts and styles by hash; images, fetch and forms only from the site; no framing.
  - The pre-paint theme script is an external file (`public/theme-init.js`) so that no inline script is needed.
- **Backups:** `pg_dump` / `pg_restore` of the Railway database (it also holds the published content). The restore was tested; see `operations.md`.
- **Docs:** operations guide (`operations.md`), Czech administrator guide (`admin-guide.md`), and pilot and release checklist (`pilot-checklist.md`).
