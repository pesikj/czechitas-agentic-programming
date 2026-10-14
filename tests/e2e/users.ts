// Test accounts created directly in the e2e database, for tests that need their own learner.
import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext } from '@playwright/test';
import postgres from 'postgres';
import { hashPassword } from '../../src/server/auth/password';
import { testAddress } from '../support/mailpit';
import { E2E_DATABASE_URL, SIGNED_OUT } from './seed';

export interface TestAccount {
  id: string;
  email: string;
  password: string;
}

export async function createActiveUser(label: string, role: 'learner' | 'admin' = 'learner'): Promise<TestAccount> {
  const email = testAddress(label);
  const password = `e2e ${randomBytes(12).toString('base64url')}`;
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into users (email, role, status, password_hash, must_change_password, invitation_status)
      values (${email}, ${role}, 'active', ${await hashPassword(password)}, false, 'sent')
      returning id`;
    return { id: row!.id, email, password };
  } finally {
    await sql.end();
  }
}

/** A browser context signed in as the account (through the real sign-in form). */
export async function signedInContext(browser: Browser, account: TestAccount): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto('/prihlaseni');
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Heslo', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();
  await page.waitForURL('/');
  await page.close();
  return context;
}
