# Plan: Milestone 3 — Accounts and protected access

Source: `roadmap.md` §3 and `product-definition.md` (sections on accounts, invitation, recovery and access boundaries). Builds on milestones 1–2. On approval, this plan is also saved as `docs/plans/milestone-3-accounts-and-access.md`.

## Context

The website currently has no sign-in. A production build answers 503 everywhere (`src/middleware.ts`), so content stays local. Milestone 3 makes the site usable by real learners. Only **active accounts created by an administrator** can reach course pages and images:

- invitation email with a one-time password (OTP);
- a password change required at first sign-in;
- **Zapomenuté heslo** (forgotten password) recovery by email;
- a minimal admin area to create single accounts and resend invitations.

The database tables already exist from milestone 1 (`src/server/db/schema.ts`): `users`, `credential_tokens`, `sessions`.

**Decisions confirmed by the user:**
- **OTP** stays valid until a password is set or it expires (7 days). A resent invitation replaces it.
- **Passwords:** at least 10 characters (up to 128), not equal to the email address, not on a list of common passwords; no character-class rules.
- **Policy values** (now confirmed): invitation 7 days, reset link 60 minutes, session 30 days, access until an admin deactivates the account.
- **Admin scope in M3:** user list, creating a single account, resending an invitation. Bulk creation, search, editing, deactivation and admin password reset are milestone 5.

**Out of scope:** bulk accounts, search, deactivation UI (milestone 5); responses (milestone 6); production SMTP, reverse proxy and backups (milestone 7).

## Design

### Security mechanics (`src/server/auth/`)
- `crypto.ts`
  - `randomToken(bytes)` (base64url) and `sha256(value)`. Only hashes are stored for session ids, OTPs and reset tokens; these are high-entropy random values, so a fast hash is fine.
  - OTP format: 12 characters from an unambiguous alphabet (no 0/O/1/I/L), grouped `ABCD-EFGH-JKMN` for typing. Input is normalised: case, dashes and spaces are ignored.
- `password.ts`:
  - argon2id via `@node-rs/argon2` (OWASP parameters); `hashPassword` and `verifyPassword`.
  - `checkPasswordPolicy(password, email)` returns Czech messages. It checks length 10–128, not equal to the email address or its local part, and not on an embedded list of about 1,000 common passwords (`src/server/auth/common-passwords.txt`).
  - A dummy hash is verified when the user does not exist, so response times don't reveal which accounts exist.
- `sessions.ts`:
  - `createSession(userId)`: a random 32-byte token goes in the cookie; `sha256(token)` is stored in `sessions.id`.
  - `validateSession(token)` returns the session joined with its user, and **only for `status !== 'deactivated'`**. Expiry slides: it is extended when less than half of `SESSION_TTL_DAYS` remains.
  - `deleteUserSessions(userId)`, `deleteSession(id)`.
  - **Cookie:** `__Host-kurz_session` in production (Secure, HttpOnly, SameSite=Lax, Path=/); `kurz_session` without Secure on http://localhost in development.
- `tokens.ts`:
  - `issueToken(userId, kind, ttl)` marks earlier unused tokens of the same kind as used, in one transaction. A resend therefore invalidates the previous OTP.
  - `findValidToken(kind, secret)` and `consumeToken(id)`. The TTLs come from `getConfig()` (`src/server/config.ts`).
- `rate-limit.ts`: an in-memory fixed window keyed by email and client address (`Astro.clientAddress`).
  - Sign-in: 10 attempts per 15 minutes. Reset requests: 3 per hour per email.
  - Limits reset when the app restarts, which is acceptable on a single VPS; this is noted for milestone 7.
- `redirect.ts`: `safeNext(value)` accepts only same-origin paths starting with a single `/` (not `//` or `/\`), otherwise falls back to `/`.

### Account flows (`src/server/auth/accounts.ts`, used by pages and the CLI)
- **`createAccount({ email, role })`:**
  1. Validates and lowercases the email (zod), rejects duplicates, inserts the user (`status: pending`, `mustChangePassword: true`), then calls `sendInvitation`.
  2. It returns separate results for account creation and invitation sending, as the roadmap requires.
- **`sendInvitation(userId)`:**
  1. Sets `invitation_status = 'sending'` and issues an OTP (7 days).
  2. Sends the email, then sets `sent` + `invitation_sent_at`, or `failed` + `invitation_error`.
  3. A failure leaves the account available for retry. **Resend** is the same call: it generates a new OTP, which invalidates the old one.
- **`signIn(email, secret)`:**
  - **Active user with a password:** verify the password, then create a session.
  - **Otherwise, a valid OTP** for a `pending` or `mustChangePassword` user: create a session, but the user is gated to the password-change page (below).
  - **Deactivated users, wrong secrets and unknown emails** all get the same message: "Nesprávný e-mail nebo heslo." It links to help.
- **`changePassword(user, newPassword)`:**
  1. Checks the password policy, stores the hash and sets `status: active`, `mustChangePassword: false`.
  2. Marks all open OTPs as used (an OTP cannot start another sign-in), deletes all of the user's sessions, then creates a fresh session (rotation).
  - A signed-in user changing their own password must also enter the current one.
- **`requestPasswordReset(email)`:**
  - Only for `status: active` users who have a password. It issues a reset token (60 minutes) and emails the link `/obnova-hesla/<token>`.
  - It **always** shows the same neutral confirmation, so recovery never creates or reactivates an account.
- **`resetPassword(token, newPassword)`:** sets the password, consumes the token, deletes all sessions and redirects to sign-in with a success message. A used or expired token shows "Odkaz už neplatí" and links to request a new one.

### Email (`src/server/email/`)
- `transport.ts`: a Nodemailer SMTP transport from `getConfig()`, already prepared for Mailpit in development.
- `templates.ts`: Czech plain-text and simple HTML, with no tracking.
  - **Invitation:** sign-in link (`APP_BASE_URL/prihlaseni`), account email, OTP, a note that a new password will be required, `SUPPORT_EMAIL` for help, and "use the latest invitation; older ones no longer work".
  - **Reset:** the link, its 60-minute validity, and a line saying the email can be ignored if the user didn't request it.

### Access control (replaces the M2 guard in `src/middleware.ts`)
1. Read the cookie, call `validateSession`, and put `locals.user` / `locals.session` in place (types in `src/env.d.ts`).
2. **Public routes:** `/prihlaseni`, `/zapomenute-heslo`, `/obnova-hesla/*`, `/_astro/*` (built CSS/JS only).
3. **Signed out:** a page request gets 303 to `/prihlaseni?next=<path>`; `/obsah/*` and other non-HTML requests get **401** with no body content.
4. **Signed in with `mustChangePassword`:** only `/zmena-hesla` and `POST /odhlaseni` are allowed; everything else redirects to `/zmena-hesla?next=…`.
5. **`/admin/*`** requires `role === 'admin'`, otherwise 403 with a link home.
6. **Headers on every response:**
   - `Cache-Control: private, no-store` on authenticated pages; `X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`.
   - `Referrer-Policy: same-origin` everywhere, so the reset token never reaches other sites. (`no-referrer` was tried on reset pages, but it makes browsers send `Origin: null` on form posts, which the origin check rejects.)
   - Form posts are protected by Astro's default origin check (`security.checkOrigin: true`) plus SameSite=Lax cookies.
7. **Return to the requested page:** `next` is carried through sign-in and the password change, using `safeNext`.

The asset route `src/pages/obsah/[...path].ts` and the provider's allowlist stay as they are; the middleware now protects them. `public/` stays empty of content.

### Pages and UI (Czech, WebTUI forms, `AuthLayout.astro` without the nav or command bar)
- `/prihlaseni`: email plus a field labelled "Heslo (nebo jednorázové heslo z pozvánky)", the **Zapomenuté heslo** link and the support contact.
- `/zmena-hesla`:
  - current password (only when the user has one), new password, confirmation;
  - the policy explained up front, with `autocomplete="new-password"`;
  - first-time wording: "Před prvním vstupem do kurzu si nastavte vlastní heslo."
- `/zapomenute-heslo` with its neutral confirmation, and `/obnova-hesla/[token]` (form, plus expired/used state).
- `/odhlaseni`: POST only; deletes the session and redirects to `/prihlaseni`.
- `CourseLayout` header: the signed-in email, an **Odhlásit** button (a form POST), and an **Administrace** link for admins.
- `/admin/uzivatele`:
  - **Table:** email, role, account status (`čeká na aktivaci` / `aktivní` / `deaktivován`), invitation status (`neodesláno` / `odesílá se` / `odesláno <datum>` / `selhalo: <důvod>`), and whether a password change is required.
  - **Create form:** email and role, with separate results for account creation and invitation sending.
  - **"Znovu odeslat pozvánku"** for pending users, with a confirmation explaining that the previous OTP stops working.

### CLI
`scripts/admin-create.ts` → `npm run admin:create -- <email>`. It creates an admin via `createAccount({ role: 'admin' })` and prints the account and invitation results. Run from the server shell, it is the documented way to create the first administrator.

## Steps (small, reviewable changes)
1. **Dependencies and config:** `@node-rs/argon2`; config value `SESSION_COOKIE_SECURE` (derived from `APP_BASE_URL` being https); `env.d.ts` locals; the `common-passwords.txt` list.
2. **Auth core:** `crypto`, `password`, `sessions`, `tokens`, `rate-limit`, `redirect`, with unit tests.
3. **Email:** transport and templates, plus `accounts.ts` flows; integration tests against a test database and Mailpit.
4. **Middleware and pages:** sign-in, password change, sign-out, forgotten password and reset; the header controls.
5. **Admin and CLI:** `/admin/uzivatele` and `admin:create`.
6. **Docs:**
   - `docs/decisions.md`: the confirmed policies, OTP semantics, password rules, rate limits.
   - `docs/data-model.md`: how the tables are used.
   - README: how to create the first admin, and Mailpit for testing.
   - Update the milestone 2 notes that said "503 until milestone 3".

## Reuse
- `getConfig()` in `src/server/config.ts`: TTLs, SMTP, `APP_BASE_URL`, `SUPPORT_EMAIL`.
- `getDb()` in `src/server/db/client.ts`, plus the existing schema. **No schema change is needed**; check that `credential_tokens` and `sessions` columns cover everything.
- `CourseLayout.astro`, `theme.css` (forms use WebTUI inputs and buttons; focus styles already restored), and `ContentIssues`-style message pages.
- `resolveAssetFile` and the provider allowlist; `HelpList`/command bar unchanged.

## Verification
- **Unit tests (Vitest):**
  - OTP generation and normalisation, `safeNext` (rejects `//evil`, `https://…`, `/\evil`), the password policy (Czech messages), the rate limiter;
  - cookie attributes in development and production.
- **Integration tests** (Vitest + Postgres database `course_test`, created and migrated in a `globalSetup`; Docker must be running):
  - Create an account: the invitation is sent and visible in Mailpit (`http://localhost:8025/api/v1/messages`).
  - A failed SMTP send gives `failed`, and a retry works.
  - A resend invalidates the old OTP.
  - An OTP signs in but is gated; after the password change the OTP is dead and old sessions are deleted.
  - Expired, used and replaced OTPs or reset tokens are rejected.
  - A reset for an unknown, pending or deactivated user sends no email.
  - A deactivated user's existing session stops working.
- **Browser tests (Playwright):** the e2e dev server uses `DATABASE_URL=…/course_e2e` and Mailpit, with tables reset in `globalSetup`.
  - **Full journey:** an admin creates a learner, the learner reads the OTP from Mailpit, signs in, is forced to change the password, and lands on the originally requested part link (`?next`).
  - **Signed out:** `/`, a part URL and `/obsah/...png` give a redirect or 401; the image body is never returned.
  - **Access rules:** a learner gets 403 on `/admin/uzivatele`; sign-out ends access, and the back button shows nothing cached.
  - **Recovery:** forgotten password → email link → new password → sign-in; the link is rejected on second use; the confirmation is identical for an unknown email.
  - **Accessibility:** axe on all auth and admin pages, in both themes.
- **Production build** (replaces `guard.spec.ts`): signed-out requests redirect to sign-in or get 401 instead of 503.
- **Manual:** run `npm run admin:create` against the dev database, then the complete invitation-to-content journey in the browser with Mailpit, in light and dark themes and at phone width.

**Acceptance (roadmap):** the invitation-to-content journey works with a test mailbox. Used or replaced OTPs cannot be reused. Recovery cannot create or reactivate accounts. Signed-out requests get no content or images. Learners cannot use admin actions.
