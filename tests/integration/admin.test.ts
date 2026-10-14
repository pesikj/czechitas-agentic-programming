// Account administration against the test database and Mailpit.
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  changePassword,
  createAccounts,
  deactivateAccount,
  deleteAccount,
  findUserByEmail,
  reactivateAccount,
  resetCredentials,
  searchUsers,
  signIn,
  updateAccount,
  type User,
} from '../../src/server/auth/accounts';
import { hashPassword } from '../../src/server/auth/password';
import { createSession, validateSession } from '../../src/server/auth/sessions';
import { getDb } from '../../src/server/db/client';
import { users } from '../../src/server/db/schema';
import { latestEmailTo, otpFrom, testAddress } from '../support/mailpit';

const PASSWORD = 'zelený kopec za řekou';

async function activeUser(label: string, role: User['role'] = 'learner'): Promise<User> {
  const [user] = await getDb()
    .insert(users)
    .values({ email: testAddress(label), role, status: 'active', passwordHash: await hashPassword(PASSWORD), mustChangePassword: false })
    .returning();
  return user!;
}

describe('bulk account creation', () => {
  it('reports each address; invalid and duplicate entries do not stop the rest', async () => {
    const existing = await activeUser('bulk-existing');
    const a = testAddress('bulk-a');
    const b = testAddress('bulk-b');
    const results = await createAccounts(`${a}\n${b.toUpperCase()}, not-an-email; ${existing.email}\n${a}`, 'learner');
    expect(results.map((result) => [result.email, result.outcome])).toEqual([
      [a, 'created'],
      [b, 'created'],
      ['not-an-email', 'invalid-email'],
      [existing.email, 'duplicate'],
      [a, 'repeated'],
    ]);
    expect(results.filter((result) => result.outcome === 'created' && result.invitation.sent)).toHaveLength(2);
    expect(otpFrom((await latestEmailTo(b)).text)).toBeTruthy();
  });
});

describe('account administration', () => {
  it('protects the last active administrator', async () => {
    const only = await activeUser('only-admin', 'admin');
    const other = await activeUser('someone');
    // Other admins from earlier tests would make this one not the last.
    await getDb().update(users).set({ status: 'deactivated' }).where(eq(users.role, 'admin'));
    await getDb().update(users).set({ status: 'active' }).where(eq(users.id, only.id));

    expect(await updateAccount(other.id, only.id, { email: only.email, role: 'learner' })).toMatchObject({ ok: false, error: expect.stringMatching(/poslední aktivní administrátor/) });
    expect(await deactivateAccount(other.id, only.id)).toMatchObject({ ok: false });
    expect(await deleteAccount(other.id, only.id, only.email)).toMatchObject({ ok: false });

    const second = await activeUser('second-admin', 'admin');
    expect(await updateAccount(second.id, only.id, { email: only.email, role: 'learner' })).toMatchObject({ ok: true });
    expect(await updateAccount(second.id, second.id, { email: second.email, role: 'learner' })).toMatchObject({ ok: false });
  });

  it('edits the email address, rejecting invalid and taken ones', async () => {
    const admin = await activeUser('editor', 'admin');
    const user = await activeUser('edit-me');
    const taken = await activeUser('taken');
    expect(await updateAccount(admin.id, user.id, { email: 'nope', role: 'learner' })).toMatchObject({ ok: false });
    expect(await updateAccount(admin.id, user.id, { email: taken.email.toUpperCase(), role: 'learner' })).toMatchObject({ ok: false });
    const renamed = testAddress('renamed');
    expect(await updateAccount(admin.id, user.id, { email: renamed.toUpperCase(), role: 'learner' })).toMatchObject({ ok: true });
    expect((await findUserByEmail(renamed))?.id).toBe(user.id);
  });

  it('deactivation ends access and keeps the account; reactivation restores it', async () => {
    const admin = await activeUser('deactivator', 'admin');
    const user = await activeUser('deactivate-me');
    const { token } = await createSession(user.id);
    expect(await deactivateAccount(admin.id, admin.id)).toMatchObject({ ok: false });
    expect(await deactivateAccount(admin.id, user.id)).toMatchObject({ ok: true });
    expect(await validateSession(token)).toBeUndefined();
    expect((await signIn(user.email, PASSWORD)).ok).toBe(false);

    expect(await reactivateAccount(user.id)).toMatchObject({ ok: true });
    expect((await findUserByEmail(user.email))?.status).toBe('active');
    expect((await signIn(user.email, PASSWORD)).ok).toBe(true);
  });

  it('a credential reset revokes the password and sessions and emails a new OTP', async () => {
    const user = await activeUser('reset-by-admin');
    const { token } = await createSession(user.id);
    const resetAt = new Date();
    expect(await resetCredentials(user.id)).toMatchObject({ ok: true });
    expect(await validateSession(token)).toBeUndefined();
    expect((await signIn(user.email, PASSWORD)).ok).toBe(false);

    const mail = await latestEmailTo(user.email, { after: resetAt });
    expect(mail.subject).toBe('Obnovený přístup k materiálům kurzu');
    const signedIn = await signIn(user.email, otpFrom(mail.text)!);
    expect(signedIn.ok && signedIn.user.mustChangePassword).toBe(true);
    if (!signedIn.ok) return;
    expect((await changePassword(signedIn.user.id, { password: 'modrá loďka na jezeře', confirmation: 'modrá loďka na jezeře' })).ok).toBe(true);
    expect((await signIn(user.email, 'modrá loďka na jezeře')).ok).toBe(true);
  });

  it('deletion needs the typed email and is refused for yourself', async () => {
    const admin = await activeUser('deleter', 'admin');
    const user = await activeUser('delete-me');
    expect(await deleteAccount(admin.id, user.id, 'wrong@example.test')).toMatchObject({ ok: false });
    expect(await deleteAccount(admin.id, admin.id, admin.email)).toMatchObject({ ok: false });
    expect(await deleteAccount(admin.id, user.id, user.email.toUpperCase())).toMatchObject({ ok: true });
    expect(await findUserByEmail(user.email)).toBeUndefined();
  });

  it('searches and filters accounts', async () => {
    const user = await activeUser('findable-xyz');
    expect((await searchUsers({ query: 'FINDABLE-XYZ' })).map((found) => found.id)).toEqual([user.id]);
    expect((await searchUsers({ query: 'findable-xyz', status: 'pending' }))).toEqual([]);
    expect((await searchUsers({ query: '%' })).length).toBe(0);
  });
});
