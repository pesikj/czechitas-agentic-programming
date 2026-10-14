// Account lifecycle: creation and invitation, sign-in, password change and recovery.
// See docs/decisions.md for the policies these functions implement.
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getConfig } from '../config';
import { getDb } from '../db/client';
import { sessions, users } from '../db/schema';
import { invitationEmail, passwordResetEmail } from '../email/templates';
import { sendEmail } from '../email/transport';
import { generateOtp, normaliseOtp, randomToken } from './crypto';
import { checkPasswordPolicy, hashPassword, verifyDummy, verifyPassword } from './password';
import { createSession } from './sessions';
import { consumeToken, findValidToken, issueToken, revokeTokens } from './tokens';

export type User = typeof users.$inferSelect;
export type Role = User['role'];

const HOUR = 3_600_000;
const MINUTE = 60_000;

const emailSchema = z.email();

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, normaliseEmail(email)))
    .limit(1);
  return user;
}

export async function findUserById(id: string): Promise<User | undefined> {
  const [user] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

// ---------- Creation and invitation ----------

export type InvitationResult = { sent: true } | { sent: false; error: string };

export type CreateAccountResult =
  | { created: true; user: User; invitation: InvitationResult }
  | { created: false; reason: 'invalid-email' | 'duplicate'; message: string };

/** Creates a pending account and sends its invitation; reports both outcomes separately. */
export async function createAccount(input: { email: string; role: Role }): Promise<CreateAccountResult> {
  const email = normaliseEmail(input.email);
  if (!emailSchema.safeParse(email).success) {
    return { created: false, reason: 'invalid-email', message: `„${input.email.trim()}“ není platná e-mailová adresa.` };
  }
  if (await findUserByEmail(email)) {
    return { created: false, reason: 'duplicate', message: `Účet ${email} už existuje.` };
  }
  let user: User;
  try {
    [user] = (await getDb().insert(users).values({ email, role: input.role }).returning()) as [User];
  } catch (error) {
    // A concurrent request created the same address.
    if ((error as { code?: string }).code === '23505') {
      return { created: false, reason: 'duplicate', message: `Účet ${email} už existuje.` };
    }
    throw error;
  }
  const invitation = await sendInvitation(user.id);
  return { created: true, user: (await findUserById(user.id)) ?? user, invitation };
}

/**
 * Issues a new one-time password (invalidating earlier ones) and emails it.
 * Used both for the first invitation and for resending.
 */
export async function sendInvitation(userId: string, kind: 'invitation' | 'reset' = 'invitation'): Promise<InvitationResult> {
  const config = getConfig();
  const db = getDb();
  const user = await findUserById(userId);
  if (!user) return { sent: false, error: 'Účet neexistuje.' };
  if (user.status === 'deactivated') return { sent: false, error: 'Účet je deaktivovaný.' };

  const otp = generateOtp();
  await db.transaction(async (tx) => {
    await issueToken(tx, user.id, 'invitation_otp', normaliseOtp(otp), config.INVITATION_TTL_HOURS * HOUR);
    await tx
      .update(users)
      .set({ invitationStatus: 'sending', invitationError: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  });

  try {
    await sendEmail(
      invitationEmail({
        kind,
        to: user.email,
        otp,
        signInUrl: new URL('/prihlaseni', config.APP_BASE_URL).toString(),
        validDays: Math.round(config.INVITATION_TTL_HOURS / 24),
        supportEmail: config.SUPPORT_EMAIL,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Neznámá chyba';
    await db
      .update(users)
      .set({ invitationStatus: 'failed', invitationError: message, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return { sent: false, error: message };
  }
  await db
    .update(users)
    .set({ invitationStatus: 'sent', invitationSentAt: new Date(), invitationError: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return { sent: true };
}

// ---------- Sign-in ----------

export type SignInResult =
  | { ok: true; user: User; token: string; expiresAt: Date }
  | { ok: false };

/**
 * Accepts the account password, or, until the first password is set, the invitation OTP.
 * Unknown, deactivated and wrong credentials are indistinguishable to the caller.
 */
export async function signIn(email: string, secret: string): Promise<SignInResult> {
  const user = await findUserByEmail(email);
  if (!user || user.status === 'deactivated' || secret === '') {
    await verifyDummy(secret);
    return { ok: false };
  }

  if (user.passwordHash && (await verifyPassword(user.passwordHash, secret))) {
    return { ok: true, user, ...(await createSession(user.id)) };
  }

  // The OTP only opens the password-change step (enforced by the middleware via mustChangePassword).
  if (user.status === 'pending' || user.mustChangePassword) {
    const otp = normaliseOtp(secret);
    if (otp.length > 0 && (await findValidToken('invitation_otp', otp, user.id))) {
      if (!user.mustChangePassword) {
        await getDb().update(users).set({ mustChangePassword: true }).where(eq(users.id, user.id));
      }
      return { ok: true, user: { ...user, mustChangePassword: true }, ...(await createSession(user.id)) };
    }
  }
  return { ok: false };
}

// ---------- Password change and recovery ----------

export type PasswordResult = { ok: true; token?: string; expiresAt?: Date } | { ok: false; errors: string[] };

function validateNewPassword(user: User, password: string, confirmation: string): string[] {
  const errors = checkPasswordPolicy(password, user.email);
  if (password !== confirmation) errors.push('Hesla se neshodují.');
  return errors;
}

/**
 * Sets the user's own password. After the invitation the current password is not asked for;
 * otherwise it must be confirmed. Ends all other sessions and returns a fresh one.
 */
export async function changePassword(
  userId: string,
  input: { current?: string; password: string; confirmation: string },
): Promise<PasswordResult> {
  const user = await findUserById(userId);
  if (!user || user.status === 'deactivated') return { ok: false, errors: ['Účet není dostupný.'] };

  if (!user.mustChangePassword) {
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.current ?? ''))) {
      return { ok: false, errors: ['Současné heslo není správné.'] };
    }
  }
  const errors = validateNewPassword(user, input.password, input.confirmation);
  if (user.passwordHash && (await verifyPassword(user.passwordHash, input.password))) {
    errors.push('Nové heslo musí být jiné než současné.');
  }
  if (errors.length > 0) return { ok: false, errors };

  const passwordHash = await hashPassword(input.password);
  await getDb().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, status: 'active', mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    // The invitation OTP can never start another sign-in, and every old session ends.
    await revokeTokens(tx, user.id, 'invitation_otp');
    await revokeTokens(tx, user.id, 'password_reset');
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
  });
  return { ok: true, ...(await createSession(user.id)) };
}

/**
 * Emails a reset link to an existing active account. Does nothing (silently) otherwise, so the
 * caller always shows the same neutral confirmation and recovery never creates or reactivates accounts.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const config = getConfig();
  const user = await findUserByEmail(email);
  if (!user || user.status !== 'active' || !user.passwordHash) return;

  const token = randomToken();
  await issueToken(getDb(), user.id, 'password_reset', token, config.PASSWORD_RESET_TTL_MINUTES * MINUTE);
  try {
    await sendEmail(
      passwordResetEmail({
        to: user.email,
        resetUrl: new URL(`/obnova-hesla/${token}`, config.APP_BASE_URL).toString(),
        validMinutes: config.PASSWORD_RESET_TTL_MINUTES,
        supportEmail: config.SUPPORT_EMAIL,
      }),
    );
  } catch (error) {
    console.error('Password reset email failed', error);
  }
}

/** The account a reset link belongs to, if the link is still usable. */
export async function findResetTarget(token: string): Promise<User | undefined> {
  const record = await findValidToken('password_reset', token);
  if (!record) return undefined;
  const user = await findUserById(record.userId);
  return user?.status === 'active' ? user : undefined;
}

export async function resetPassword(token: string, password: string, confirmation: string): Promise<PasswordResult> {
  const record = await findValidToken('password_reset', token);
  const user = record && (await findUserById(record.userId));
  if (!record || !user || user.status !== 'active') {
    return { ok: false, errors: ['Odkaz pro obnovení hesla už neplatí.'] };
  }
  const errors = validateNewPassword(user, password, confirmation);
  if (errors.length > 0) return { ok: false, errors };

  const passwordHash = await hashPassword(password);
  const applied = await getDb().transaction(async (tx) => {
    if (!(await consumeToken(tx, record.id))) return false;
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await revokeTokens(tx, user.id, 'password_reset');
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    return true;
  });
  return applied ? { ok: true } : { ok: false, errors: ['Odkaz pro obnovení hesla už neplatí.'] };
}

// ---------- Bulk creation ----------

export type BulkEntryResult =
  | { email: string; outcome: 'created'; invitation: InvitationResult }
  | { email: string; outcome: 'invalid-email' | 'duplicate' | 'repeated' };

/** Splits pasted text (lines, commas, semicolons, spaces) into addresses. */
function parseEmailList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().replace(/^<|>$/g, ''))
    .filter(Boolean);
}

/** Creates each address independently: invalid or duplicate entries never stop the others. */
export async function createAccounts(text: string, role: Role): Promise<BulkEntryResult[]> {
  const seen = new Set<string>();
  const results: BulkEntryResult[] = [];
  for (const entry of parseEmailList(text)) {
    const email = normaliseEmail(entry);
    if (seen.has(email)) {
      results.push({ email, outcome: 'repeated' });
      continue;
    }
    seen.add(email);
    const result = await createAccount({ email: entry, role });
    results.push(result.created ? { email: result.user.email, outcome: 'created', invitation: result.invitation } : { email: entry.trim(), outcome: result.reason });
  }
  return results;
}

// ---------- Administration ----------

export type AdminResult = { ok: true; message: string } | { ok: false; error: string };

const fail = (error: string): AdminResult => ({ ok: false, error });

/** Whether removing admin access from this user would leave no active administrator. */
async function isLastActiveAdmin(user: User): Promise<boolean> {
  if (user.role !== 'admin' || user.status === 'deactivated') return false;
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.role} = 'admin' and ${users.status} <> 'deactivated'`);
  return (row?.count ?? 0) <= 1;
}

export interface UserFilter {
  query?: string;
  status?: User['status'];
  role?: Role;
}

export async function searchUsers(filter: UserFilter): Promise<User[]> {
  const conditions = [
    filter.query ? sql`lower(${users.email}) like ${`%${filter.query.trim().toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`)}%`}` : undefined,
    filter.status ? eq(users.status, filter.status) : undefined,
    filter.role ? eq(users.role, filter.role) : undefined,
  ].filter((condition) => condition !== undefined);
  return getDb()
    .select()
    .from(users)
    .where(conditions.length > 0 ? sql.join(conditions, sql` and `) : undefined)
    .orderBy(asc(users.email));
}

export async function updateAccount(actorId: string, userId: string, input: { email: string; role: Role }): Promise<AdminResult> {
  const user = await findUserById(userId);
  if (!user) return fail('Účet neexistuje.');
  const email = normaliseEmail(input.email);
  if (!emailSchema.safeParse(email).success) return fail(`„${input.email.trim()}“ není platná e-mailová adresa.`);
  if (email !== user.email) {
    const other = await findUserByEmail(email);
    if (other && other.id !== user.id) return fail(`Účet ${email} už existuje.`);
  }
  if (input.role !== 'admin' && (await isLastActiveAdmin(user))) {
    return fail('Toto je poslední aktivní administrátor. Nejdřív jmenujte jiného administrátora.');
  }
  if (input.role !== 'admin' && user.id === actorId) return fail('Svou vlastní roli administrátora odebrat nemůžete.');
  await getDb().update(users).set({ email, role: input.role, updatedAt: new Date() }).where(eq(users.id, user.id));
  return { ok: true, message: 'Změny byly uloženy.' };
}

export async function deactivateAccount(actorId: string, userId: string): Promise<AdminResult> {
  const user = await findUserById(userId);
  if (!user) return fail('Účet neexistuje.');
  if (user.id === actorId) return fail('Vlastní účet deaktivovat nemůžete.');
  if (await isLastActiveAdmin(user)) return fail('Poslední aktivní administrátor nemůže být deaktivován.');
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ status: 'deactivated', updatedAt: new Date() }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await revokeTokens(tx, user.id, 'invitation_otp');
    await revokeTokens(tx, user.id, 'password_reset');
  });
  return { ok: true, message: `Účet ${user.email} byl deaktivován. Uživatel byl odhlášen; jeho odpovědi zůstávají uložené.` };
}

export async function reactivateAccount(userId: string): Promise<AdminResult> {
  const user = await findUserById(userId);
  if (!user) return fail('Účet neexistuje.');
  if (user.status !== 'deactivated') return fail('Účet není deaktivovaný.');
  const status = user.passwordHash ? 'active' : 'pending';
  await getDb().update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, user.id));
  return {
    ok: true,
    message:
      status === 'active'
        ? `Účet ${user.email} je znovu aktivní; uživatel se může přihlásit svým heslem.`
        : `Účet ${user.email} znovu čeká na aktivaci. Pošlete mu novou pozvánku.`,
  };
}

/**
 * Administrator credential reset: removes the password, ends all sessions and emails a new
 * one-time password; the user must choose a new password at the next sign-in.
 */
export async function resetCredentials(userId: string): Promise<AdminResult> {
  const user = await findUserById(userId);
  if (!user) return fail('Účet neexistuje.');
  if (user.status === 'deactivated') return fail('Deaktivovanému účtu nelze obnovit přístup. Nejdřív ho znovu aktivujte.');
  await getDb().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: null, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await revokeTokens(tx, user.id, 'password_reset');
  });
  const invitation = await sendInvitation(user.id, 'reset');
  return invitation.sent
    ? { ok: true, message: `Přístup účtu ${user.email} byl obnoven a nové jednorázové heslo předáno k odeslání.` }
    : fail(`Přístup byl obnoven, ale e-mail se nepodařilo odeslat: ${invitation.error}. Zkuste pozvánku odeslat znovu.`);
}

/** Permanently deletes the account and, per the retention policy, its saved responses. */
export async function deleteAccount(actorId: string, userId: string, confirmation: string): Promise<AdminResult> {
  const user = await findUserById(userId);
  if (!user) return fail('Účet neexistuje.');
  if (user.id === actorId) return fail('Vlastní účet smazat nemůžete.');
  if (await isLastActiveAdmin(user)) return fail('Posledního aktivního administrátora nelze smazat.');
  if (normaliseEmail(confirmation) !== user.email) return fail('Pro potvrzení opište přesně e-mailovou adresu účtu.');
  await getDb().delete(users).where(eq(users.id, user.id));
  return { ok: true, message: `Účet ${user.email} a jeho uložené odpovědi byly trvale smazány.` };
}
