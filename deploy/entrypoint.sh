#!/bin/sh
# Applies pending database migrations, then starts the server (or another given command).
set -e
cd /app
npx tsx scripts/migrate.ts
exec "$@"
