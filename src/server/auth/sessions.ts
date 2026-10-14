// Server-side sessions: the cookie holds a random token, the database only its hash, so
// sessions can be ended immediately (sign-out, password change, deactivation).
import { and, eq, gt } from 'drizzle-orm';
import { getConfig, usesHttps } from '../config';
import { getDb } from '../db/client';
import { sessions, users } from '../db/schema';
import { randomToken, sha256 } from './crypto';

export type SessionUser = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

const DAY = 86_400_000;

export function sessionCookieName(): string {
  return usesHttps() ? '__Host-kurz_session' : 'kurz_session';
}

export function sessionCookieOptions(expires: Date) {
  return { httpOnly: true, secure: usesHttps(), sameSite: 'lax' as const, path: '/', expires };
}

function ttl(): number {
  return getConfig().SESSION_TTL_DAYS * DAY;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttl());
  await getDb().insert(sessions).values({ id: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

/**
 * The session and its user, or undefined when missing, expired or the account is deactivated.
 * `refreshed` is set when the expiry was extended and the cookie should be re-sent.
 */
export async function validateSession(
  token: string,
): Promise<{ session: Session; user: SessionUser; refreshed: boolean } | undefined> {
  const db = getDb();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.user.status === 'deactivated') return undefined;

  // Sliding expiry: extend once less than half of the lifetime remains.
  if (row.session.expiresAt.getTime() - Date.now() < ttl() / 2) {
    const expiresAt = new Date(Date.now() + ttl());
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.session.id));
    return { session: { ...row.session, expiresAt }, user: row.user, refreshed: true };
  }
  return { ...row, refreshed: false };
}

export async function deleteSession(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.id, sha256(token)));
}
