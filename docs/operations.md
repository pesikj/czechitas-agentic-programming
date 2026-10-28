# Operations: deployment, backups and recovery

Production runs on [Railway](https://railway.com) (Hobby plan). It has two services:

- **app**: the Astro server, built from the `Dockerfile` (settings in `railway.json`: health check `/health`, restart on failure). It applies database migrations when it starts.
- **Postgres**: Railway's PostgreSQL service with accounts, responses, publishing history and the published content.

Railway provides HTTPS and the reverse proxy. Course content comes from the content git repository. Publishing stores the prepared content of the active revision in the database, so the app needs no volume.

## First deployment

1. **Project:** *New Project → Deploy from GitHub repo* (this repository), then *+ New → Database → PostgreSQL*. Choose the EU West region for both.
2. **App variables:**
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`;
   - `APP_BASE_URL` = the `https://` address from step 3;
   - `TRUST_PROXY` = `true`;
   - `CONTENT_REPO_URL` = `https://github.com/<org>/<content-repo>.git`;
   - `CONTENT_REPO_TOKEN` = a fine-grained GitHub token limited to the content repository, **Contents: read-only** (GitHub → *Settings → Developer settings → Fine-grained tokens*). Add it as a Railway variable (sealed, if you like); it is sent to GitHub as an HTTP header and never shown in the administration or in error messages. Note the token's expiry date: publishing fails once it expires, and the administration then says to check the token. Not needed for a public content repository;
   - `CONTENT_BRANCH`, `SUPPORT_EMAIL`;
   - **Email:** Railway blocks outgoing SMTP below the Pro plan. Set `BREVO_API_KEY` (Brevo → *SMTP & API → API keys*) and `SMTP_FROM` with a sender verified in Brevo. Set up SPF and DKIM for the sender's domain in Brevo, otherwise invitations end up in spam. (On Pro, the `SMTP_*` settings work as well.)

   **Never set `CONTENT_DIR`** in production. It switches on preview mode, which bypasses publishing.
3. **Networking:** generate a Railway domain or add your own (CNAME), and put it in `APP_BASE_URL`. Keep **one replica**: rate limits and the publishing lock are kept in the app's memory.
4. **Check:** `curl -fsS https://<domain>/health` returns `ok`.
5. **First administrator:** `railway ssh` (Railway CLI, linked to the app service) opens a shell in the container; run:
   ```bash
   npx tsx scripts/admin-create.ts admin@example.cz
   ```
   Running it again for an administrator who has not activated yet resends the invitation.
6. **First publication:** the administrator signs in, sets a password and selects **Aktualizovat obsah** under Administrace → Obsah. Until then, learners see "Materiály zatím nejsou k dispozici".
7. **Check the client address:** sign-in rate limiting uses the last `X-Forwarded-For` address. Confirm in the logs that it is the visitor's address, not Railway's proxy.

## Updating the website

Push to the deployed branch; Railway rebuilds and redeploys the app. Migrations run automatically when the app starts. Sessions survive the update because they are stored in the database. Content stays at the published revision. Website updates never fetch or publish new content.

## Backups

The database holds accounts, saved responses, the publishing history and the published content (including images), so one archive restores everything.

Make a regular `pg_dump` archive and keep it **outside Railway** (for example on a computer or in cloud storage). Use the Postgres service's `DATABASE_PUBLIC_URL` (Railway → Postgres → Variables) and a `pg_dump` of version 16 or newer:

```bash
pg_dump --format=custom --no-owner "$DATABASE_PUBLIC_URL" > course-$(date -u +%Y%m%dT%H%M%SZ).dump
pg_restore --list course-<timestamp>.dump > /dev/null   # checks that the archive is readable
```

If your plan offers it, also enable backups on the Postgres service in Railway.

## Restore

1. Stop learners from writing: remove the app's domain or scale the app down in Railway.
2. Restore the archive into the database (this **replaces** its current data):
   ```bash
   pg_restore --clean --if-exists --no-owner --exit-on-error -d "$DATABASE_PUBLIC_URL" course-<timestamp>.dump
   ```
   To restore into a new Railway project, deploy it as in "First deployment" (steps 1–4) first.
3. Restart the app so it reloads the active content revision, then check:
   - `/health` returns `ok`;
   - an administrator can sign in;
   - lectures and images load (they come from the restored database);
   - **Odpovědi** lists the saved answers.

**The restore was tested** (5 October 2026) against a copy of a test database. Users, responses, publishing history and migration state were identical after restoring. Before real learner data depends on the deployment, run the same drill once against Railway: back up, restore into a scratch database (`createdb` on the same server, then `pg_restore -d <its URL>`), compare the row counts and drop the scratch database.

## Monitoring and logs

- Railway → app → **Deployments / Logs** (or `railway logs`): failed emails, content updates and errors. The health check calls `/health`, which also checks the database.
- Invitation delivery is visible per user in **Administrace → Uživatelé** (`odesláno` / `selhalo: …`).

## Security notes

- **Access:** the app trusts `X-Forwarded-For` (`TRUST_PROXY=true`) only because Railway's proxy is the only way in.
- **Headers:** responses carry a strict Content Security Policy (scripts and styles by hash; images, fetch requests and forms only from the site itself; no framing), plus `X-Frame-Options`, `nosniff`, `Referrer-Policy` and, over HTTPS, HSTS.
- **Content files:** course images are served only to signed-in users (or with public lectures), and only files referenced by the published content. Nothing in `public/` contains course content.
- **Rate limits** on sign-in and password resets are kept in memory, so they reset when the app restarts. That is fine for a single replica.
