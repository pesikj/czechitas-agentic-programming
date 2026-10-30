# Data model

PostgreSQL, defined in `src/server/db/schema.ts` (Drizzle). Migrations are in `drizzle/`: generate them with `npm run db:generate` and apply them with `npm run db:migrate`.

The content repository is the source of course content. Publishing stores the **prepared content of the active revision** in the database (`content_snapshots`, `content_assets`), so the server keeps no content files on disk. Learner records stay separate from the content repository.

## `users`

| Column | Notes |
|---|---|
| `email` | Unique, case-insensitive (`lower(email)` index) |
| `role` | `learner` \| `admin` |
| `status` | `pending` (not yet activated) \| `active` \| `deactivated`. This is the account state. |
| `invitation_status`, `invitation_sent_at`, `invitation_error` | Delivery state, kept **separate** from activation: `not_sent` \| `sending` \| `sent` \| `failed`. `sent` means the SMTP server accepted the email, not that it was received. |
| `password_hash` | argon2id; null until the user sets a password. Passwords cannot be retrieved. |
| `must_change_password` | True after an invitation or an administrator reset. Content is blocked until the password is changed. |

## `credential_tokens`

One-time invitation passwords (`invitation_otp`) and reset links (`password_reset`). Only a hash is stored. A token is valid while `used_at` is null and `expires_at` is in the future. Issuing a new token sets `used_at` on the user's earlier open tokens of the same kind, so a resent invitation invalidates the previous one.

## `sessions`

Server-side sessions (`src/server/auth/sessions.ts`, since milestone 3); the cookie holds a random token and the table stores its hash. Password changes and resets delete the user's sessions, and a deactivated account's sessions are refused on the next request, so both end access immediately.

## `content_revisions`

One row per **Aktualizovat obsah** run: `commit_sha`, `status` (`pending` → `validating` → `ready` → `active`, or `failed`; the previous active revision becomes `superseded`), validation `issues`, `error_message`, `triggered_by` and timestamps.

- A partial unique index allows **at most one `active`** revision.
- A partial unique index allows **at most one run in progress** (`pending`/`validating`), which prevents overlapping updates.

## `content_snapshots` and `content_assets`

The prepared content of a published revision (`src/server/content/snapshot-store.ts`), written in the same transaction that activates it. Only the active revision keeps its snapshot; activating a new one deletes the others (their `content_revisions` rows stay).

| Table | Columns |
|---|---|
| `content_snapshots` | `revision_id` (primary key, references `content_revisions`), `model` (navigation model of every course as JSON, `{ courses: [...] }`; the exercise maps are rebuilt from the parts, and a row in the older single-course format is rebuilt from its commit), `rendered` (sanitized HTML by `lectureId/partId`), `search` (search index), `created_at` |
| `content_assets` | `(revision_id, path)` primary key, `content_type`, `width`, `height`, `data` (file bytes, `bytea`). Only images and linked files referenced by the content are stored. |

## `responses`

The **one current saved answer per learner and exercise**. Primary key: `(user_id, exercise_id)`. Saving uses an upsert; the last successful save wins.

| Column | Notes |
|---|---|
| `course_id` | The course of the exercise at save time (required; migration `0001` fills existing rows with `agent`) |
| `exercise_id`, `exercise_revision` | Compared with the current exercise to flag answers to an earlier revision |
| `content_revision_id` | The published revision the answer was saved against |
| `lecture_id`, `part_id`, `lecture_title`, `part_title`, `exercise_title`, `field_labels` | Snapshots taken at save time, so answers stay listable and exportable after the exercise moves or is removed |
| `fields` | `{ fieldId: markdown }` |
| `saved_at` | Last successful save |

There are deliberately **no** tables for drafts, answer history, progress, completion or grading.

## Deletion

Deleting a user cascades to their tokens, sessions and responses. This is the proposed default and still needs confirmation (see `decisions.md`). Deactivation keeps everything.
