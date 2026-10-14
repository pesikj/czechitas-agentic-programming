// Prepares the e2e database and seeds an active admin and learner with random passwords.
// The passwords exist only for this run (passed to the tests through process.env).
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { hashPassword } from '../../src/server/auth/password';
import { createContentRepo } from '../support/content-repo';
import { prepareDatabase } from '../support/database';
import { E2E_CONTENT_REPO, E2E_DATABASE_URL, SEED } from './seed';

export default async function globalSetup(): Promise<void> {
  await prepareDatabase(E2E_DATABASE_URL);
  createContentRepo(E2E_CONTENT_REPO, 'fixtures/content/e2e');
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    for (const account of [SEED.admin, SEED.learner]) {
      const password = `e2e ${randomBytes(12).toString('base64url')}`;
      process.env[account.passwordEnv] = password;
      await sql`
        insert into users (email, role, status, password_hash, must_change_password, invitation_status)
        values (${account.email}, ${account.role}, 'active', ${await hashPassword(password)}, false, 'sent')`;
    }
  } finally {
    await sql.end();
  }
}
