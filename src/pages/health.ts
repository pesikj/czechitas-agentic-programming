import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { getDb } from '../server/db/client';

/** Health check for the container and reverse proxy. Reveals nothing about content or users. */
export const GET: APIRoute = async () => {
  try {
    await getDb().execute(sql`select 1`);
    return new Response('ok', { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('database unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
};
