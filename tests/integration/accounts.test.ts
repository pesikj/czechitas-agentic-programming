// Account flows against a real Postgres (course_test) and the Mailpit test mailbox.
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it } from 'vitest';
import {
  changePassword,
  createAccount,
  findResetTarget,
  findUserByEmail,
  requestPasswordReset,
  resetPassword,
  sendInvitation,
  signIn,
} from '../../src/server/auth/accounts';
import { validateSession } from '../../src/server/auth/sessions';
import { getDb } from '../../src/server/db/client';
import { credentialTokens, users } from '../../src/server/db/schema';
import { setTransporterForTests } from '../../src/server/email/transport';
import { countEmailsTo, latestEmailTo, otpFrom, resetLinkFrom, testAddress } from '../support/mailpit';

const PASSWORD = 'zelený kopec za řekou';
const NEW_PASSWORD = 'modrá loďka na jezeře';

afterEach(() => setTransporterForTests(undefined));

/** Creates a learner and returns the OTP from the invitation email. */
async function invite(label: string) {
  const email = testAddress(label);
  const result = await createAccount({ email, role: 'learner' });
  if (!result.created) throw new Error(result.message);
  const mail = await latestEmailTo(email);
  return { email, user: result.user, otp: otpFrom(mail.text)!, mail };
}

/** Invites a learner and completes activation; returns the active user. */
async function activeLearner(label: string) {
  const { email, otp } = await invite(label);
  const signedIn = await signIn(email, otp);
  if (!signedIn.ok) throw new Error('OTP sign-in failed');
  const changed = await changePassword(signedIn.user.id, { password: PASSWORD, confirmation: PASSWORD });
  if (!changed.ok) throw new Error(changed.errors.join(' '));
  return { email, user: (await findUserByEmail(email))!, token: changed.token! };
}

describe('account creation and invitation', () => {
  it('creates a pending account and emails a working invitation', async () => {
    const { email, user, otp, mail } = await invite('create');
    expect(user).toMatchObject({ email, role: 'learner', status: 'pending', mustChangePassword: true, invitationStatus: 'sent' });
    expect(user.invitationSentAt).toBeInstanceOf(Date);
    expect(mail.subject).toBe('Přístup k materiálům kurzu');
    expect(mail.text).toContain('/prihlaseni');
    expect(mail.text).toContain(email);
    expect(mail.text).toContain('použijte tu nejnovější');
    expect(otp).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('rejects invalid and duplicate addresses (case-insensitively)', async () => {
    expect(await createAccount({ email: 'not-an-email', role: 'learner' })).toMatchObject({
      created: false,
      reason: 'invalid-email',
    });
    const { email } = await invite('duplicate');
    expect(await createAccount({ email: email.toUpperCase(), role: 'learner' })).toMatchObject({
      created: false,
      reason: 'duplicate',
    });
  });

  it('records a failed send and allows a retry', async () => {
    setTransporterForTests(nodemailer.createTransport({ host: '127.0.0.1', port: 9, connectionTimeout: 1000 }));
    const email = testAddress('smtp-failure');
    const result = await createAccount({ email, role: 'learner' });
    expect(result.created && result.invitation.sent).toBe(false);
    const failed = await findUserByEmail(email);
    expect(failed).toMatchObject({ status: 'pending', invitationStatus: 'failed' });
    expect(failed!.invitationError).toBeTruthy();

    setTransporterForTests(undefined);
    expect(await sendInvitation(failed!.id)).toEqual({ sent: true });
    expect(await findUserByEmail(email)).toMatchObject({ invitationStatus: 'sent', invitationError: null });
    expect(otpFrom((await latestEmailTo(email)).text)).toBeTruthy();
  });

  it('resending invalidates the previous one-time password', async () => {
    const { email, user, otp: first } = await invite('resend');
    const sentAt = new Date();
    await sendInvitation(user.id);
    const second = otpFrom((await latestEmailTo(email, { after: sentAt })).text)!;
    expect(second).not.toBe(first);
    expect((await signIn(email, first)).ok).toBe(false);
    expect((await signIn(email, second)).ok).toBe(true);
  });
});

describe('first sign-in and password change', () => {
  it('signs in with the OTP (any case, without dashes) but requires a password change', async () => {
    const { email, otp } = await invite('otp');
    const result = await signIn(email.toUpperCase(), otp.toLowerCase().replace(/-/g, ''));
    expect(result.ok && result.user.mustChangePassword).toBe(true);
  });

  it('keeps the OTP usable until the password is set, then never again', async () => {
    const { email, otp } = await invite('otp-lifetime');
    const first = await signIn(email, otp);
    const again = await signIn(email, otp);
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;

    const changed = await changePassword(first.user.id, { password: PASSWORD, confirmation: PASSWORD });
    expect(changed.ok).toBe(true);
    expect(await findUserByEmail(email)).toMatchObject({ status: 'active', mustChangePassword: false });
    expect((await signIn(email, otp)).ok).toBe(false);
    // Sessions opened before the change are ended; the new one works.
    expect(await validateSession(first.token)).toBeUndefined();
    expect(await validateSession(again.token)).toBeUndefined();
    expect(await validateSession(changed.ok ? changed.token! : '')).toBeDefined();
    expect((await signIn(email, PASSWORD)).ok).toBe(true);
  });

  it('rejects an expired OTP', async () => {
    const { email, user, otp } = await invite('otp-expired');
    await getDb()
      .update(credentialTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(credentialTokens.userId, user.id));
    expect((await signIn(email, otp)).ok).toBe(false);
  });

  it('enforces the password policy and confirmation', async () => {
    const { email, otp } = await invite('policy');
    const signedIn = await signIn(email, otp);
    if (!signedIn.ok) throw new Error('sign-in failed');
    const result = await changePassword(signedIn.user.id, { password: 'kratke', confirmation: 'jine' });
    expect(result).toEqual({ ok: false, errors: ['Heslo musí mít alespoň 10 znaků.', 'Hesla se neshodují.'] });
  });

  it('requires the current password for a voluntary change', async () => {
    const { user } = await activeLearner('voluntary');
    expect(await changePassword(user.id, { current: 'špatně zadané', password: NEW_PASSWORD, confirmation: NEW_PASSWORD })).toEqual({
      ok: false,
      errors: ['Současné heslo není správné.'],
    });
    expect((await changePassword(user.id, { current: PASSWORD, password: NEW_PASSWORD, confirmation: NEW_PASSWORD })).ok).toBe(true);
  });

  it('gives the same answer for unknown, wrong and deactivated sign-ins', async () => {
    const { email, user, token } = await activeLearner('deactivated');
    expect(await signIn(testAddress('unknown'), PASSWORD)).toEqual({ ok: false });
    expect(await signIn(email, 'špatné heslo celé')).toEqual({ ok: false });

    await getDb().update(users).set({ status: 'deactivated' }).where(eq(users.id, user.id));
    expect(await signIn(email, PASSWORD)).toEqual({ ok: false });
    // An existing session stops working immediately.
    expect(await validateSession(token)).toBeUndefined();
  });
});

describe('password recovery', () => {
  it('emails a single-use link that sets a new password and ends sessions', async () => {
    const { email, token: session } = await activeLearner('reset');
    const requestedAt = new Date();
    await requestPasswordReset(email.toUpperCase());
    const mail = await latestEmailTo(email, { after: requestedAt });
    expect(mail.subject).toBe('Obnovení hesla ke kurzu');
    const link = resetLinkFrom(mail.text)!;
    const token = link.split('/obnova-hesla/')[1]!;

    expect((await findResetTarget(token))?.email).toBe(email);
    expect(await resetPassword(token, NEW_PASSWORD, NEW_PASSWORD)).toEqual({ ok: true });
    expect(await validateSession(session)).toBeUndefined();
    expect((await signIn(email, PASSWORD)).ok).toBe(false);
    expect((await signIn(email, NEW_PASSWORD)).ok).toBe(true);

    expect(await findResetTarget(token)).toBeUndefined();
    expect(await resetPassword(token, 'další nové heslo zde', 'další nové heslo zde')).toEqual({
      ok: false,
      errors: ['Odkaz pro obnovení hesla už neplatí.'],
    });
  });

  it('rejects an expired link', async () => {
    const { email, user } = await activeLearner('reset-expired');
    const requestedAt = new Date();
    await requestPasswordReset(email);
    const token = resetLinkFrom((await latestEmailTo(email, { after: requestedAt })).text)!.split('/obnova-hesla/')[1]!;
    await getDb()
      .update(credentialTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(credentialTokens.userId, user.id));
    expect(await findResetTarget(token)).toBeUndefined();
    expect((await resetPassword(token, NEW_PASSWORD, NEW_PASSWORD)).ok).toBe(false);
  });

  it('never emails unknown, pending or deactivated accounts', async () => {
    const unknown = testAddress('reset-unknown');
    await requestPasswordReset(unknown);

    const { email: pending } = await invite('reset-pending');
    const before = await countEmailsTo(pending);
    await requestPasswordReset(pending);

    const { email: deactivated, user } = await activeLearner('reset-deactivated');
    await getDb().update(users).set({ status: 'deactivated' }).where(eq(users.id, user.id));
    const beforeDeactivated = await countEmailsTo(deactivated);
    await requestPasswordReset(deactivated);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await countEmailsTo(unknown)).toBe(0);
    expect(await countEmailsTo(pending)).toBe(before);
    expect(await countEmailsTo(deactivated)).toBe(beforeDeactivated);
    expect(await findUserByEmail(unknown)).toBeUndefined();
  });
});
