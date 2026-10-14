// Creates (if needed), migrates and empties a dedicated test database next to the dev database.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/** The dev database URL from .env, read without changing process.env. */
function devDatabaseUrl(): string {
  const fromFile = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')).DATABASE_URL : undefined;
  const url = fromFile ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (copy .env.example to .env).');
  return url;
}

/** Only throwaway test databases may be emptied. */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.slice(1);
  if (!/_(test|e2e)$/.test(name)) {
    throw new Error(`Refusing to reset database "${name}": only *_test or *_e2e databases are reset by tests.`);
  }
}

/** The dev database URL with another database name, e.g. course_test. */
export function databaseUrlFor(name: string, base = devDatabaseUrl()): string {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function prepareDatabase(url: string): Promise<void> {
  assertTestDatabase(url);
  const name = new URL(url).pathname.slice(1);
  const admin = postgres(databaseUrlFor('postgres', url), { max: 1, onnotice: () => {} });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${name}`;
    if (existing.length === 0) await admin.unsafe(`create database "${name.replace(/"/g, '')}"`);
  } catch (error) {
    throw new Error(`Cannot reach Postgres for tests. Is it running? (docker compose up -d)\n${String(error)}`);
  } finally {
    await admin.end();
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
    await client`truncate table responses, sessions, credential_tokens, content_assets, content_snapshots, content_revisions, users restart identity cascade`;
  } finally {
    await client.end();
  }
}
