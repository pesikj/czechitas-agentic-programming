# Czechitas Course Terminal

A Czech-language course website with a terminal-style interface, accompanying an instructor-led course on agentic programming. The requirements are in [product-definition.md](product-definition.md), the plan in [roadmap.md](roadmap.md), and the implementation choices in [docs/decisions.md](docs/decisions.md).

Course materials live in the separate repository `../czechitas-agentic-programming-content`; the format is described in [docs/content-contract.md](docs/content-contract.md).

## Development setup

Requires Node.js ≥ 22.12 (see `.nvmrc`) and Docker.

```bash
cp .env.example .env
docker compose up -d        # Postgres on :5442, Mailpit on :1025 / http://localhost:8025
npm install
npm run db:migrate
npm run dev                 # http://localhost:4321
```

Everything except sign-in requires an account. Create the first administrator, then open the invitation in Mailpit (http://localhost:8025):

```bash
npm run admin:create -- you@example.test
```

Learners see only **published** content: as the administrator, open **Administrace → Obsah** and select **Aktualizovat obsah**. This needs at least one commit on `CONTENT_BRANCH` in the content repository. While writing content, you can instead set `CONTENT_DIR` in `.env` (preview mode: the site reads that directory directly and reloads on change).

After changing `src/middleware.ts`, restart `npm run dev`; the dev server does not reload middleware.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Unit tests plus integration tests of accounts, publishing and responses (needs `docker compose up -d`; uses the `course_test` database) |
| `npm run test:e2e` | Browser tests (Playwright: desktop Chromium + mobile WebKit, axe accessibility; `course_e2e` database and Mailpit). First time: `npx playwright install chromium webkit` |
| `npm run admin:create -- <email>` | Create an administrator and send the invitation (or resend it if not yet activated) |
| `npm run check` | Type-check Astro and TypeScript |
| `npm run build` | Production build |
| `npm run content:validate -- <dir>` | Validate a content repository checkout |
| `npm run db:generate` | Generate a migration after changing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |

## Layout

```
src/lib/content/    content loader, validator, Markdown pipeline
src/lib/            navigation and command registry (pure, shared with the browser)
src/server/         configuration, database, accounts (auth/), content publishing (content/), responses
src/pages/          Astro routes: learning pages, sign-in and password pages, /hledat, /moje-odpovedi, /admin/*
src/layouts/, src/components/, src/styles/, src/scripts/   learning interface
fixtures/content/   test content (minimal, invalid cases, e2e)
docs/               content contract, data model, decisions, operations, admin guide (Czech), pilot checklist
drizzle/            SQL migrations
deploy/, Dockerfile, railway.json   production on Railway (see docs/operations.md)
```

## Production

See [docs/operations.md](docs/operations.md) for deployment, backups and recovery, [docs/admin-guide.md](docs/admin-guide.md) for administrators, and [docs/pilot-checklist.md](docs/pilot-checklist.md) for the launch gate.
