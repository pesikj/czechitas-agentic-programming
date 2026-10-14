// One-time invitation passwords and password-reset links. Only hashes are stored.
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import { credentialTokens } from '../db/schema';
import { sha256 } from './crypto';

export type TokenKind = (typeof credentialTokens.$inferSelect)['kind'];
type Db = ReturnType<typeof getDb>;
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/** Stores a new token and invalidates the user's earlier open tokens of the same kind. */
export async function issueToken(
  executor: Executor,
  userId: string,
  kind: TokenKind,
  secret: string,
  ttlMs: number,
): Promise<void> {
  await revokeTokens(executor, userId, kind);
  await executor.insert(credentialTokens).values({
    userId,
    kind,
    tokenHash: sha256(secret),
    expiresAt: new Date(Date.now() + ttlMs),
  });
}

/** Marks every open token of this kind as used, e.g. after a successful password change. */
export async function revokeTokens(executor: Executor, userId: string, kind: TokenKind): Promise<void> {
  await executor
    .update(credentialTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(credentialTokens.userId, userId), eq(credentialTokens.kind, kind), isNull(credentialTokens.usedAt)));
}

/** An unused, unexpired token matching the secret (optionally for a specific user). */
export async function findValidToken(kind: TokenKind, secret: string, userId?: string) {
  const [token] = await getDb()
    .select()
    .from(credentialTokens)
    .where(
      and(
        eq(credentialTokens.kind, kind),
        eq(credentialTokens.tokenHash, sha256(secret)),
        isNull(credentialTokens.usedAt),
        gt(credentialTokens.expiresAt, new Date()),
        ...(userId ? [eq(credentialTokens.userId, userId)] : []),
      ),
    )
    .limit(1);
  return token;
}

/** Marks a token as used; returns false if it was already used (e.g. a concurrent request). */
export async function consumeToken(executor: Executor, id: string): Promise<boolean> {
  const updated = await executor
    .update(credentialTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(credentialTokens.id, id), isNull(credentialTokens.usedAt)))
    .returning({ id: credentialTokens.id });
  return updated.length === 1;
}
