import path from 'node:path';
import { databaseUrlFor } from '../support/database';

export const E2E_DATABASE_URL = databaseUrlFor('course_e2e');

export const SEED = {
  admin: { email: 'e2e-admin@example.test', role: 'admin', passwordEnv: 'E2E_ADMIN_PASSWORD', state: 'playwright/.auth/admin.json' },
  learner: { email: 'e2e-learner@example.test', role: 'learner', passwordEnv: 'E2E_LEARNER_PASSWORD', state: 'playwright/.auth/learner.json' },
} as const;

export const SIGNED_OUT = { cookies: [], origins: [] };

/** Git repository holding the e2e fixture content. */
export const E2E_CONTENT_REPO = path.resolve('.e2e/content-repo');
