import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { databaseUrlFor } from './tests/support/database';

/** Content repository for publishing tests (created by the integration global setup). */
export const TEST_CONTENT_REPO = path.join(os.tmpdir(), 'course-test', 'content-repo');

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'unit', include: ['tests/*.test.ts'] },
      },
      {
        // Needs Postgres and Mailpit: docker compose up -d
        test: {
          name: 'integration',
          include: ['tests/integration/*.test.ts'],
          env: {
            DATABASE_URL: databaseUrlFor('course_test'),
            CONTENT_REPO_URL: TEST_CONTENT_REPO,
            CONTENT_BRANCH: 'main',
            CONTENT_DIR: '',
          },
          globalSetup: ['tests/integration/global-setup.ts'],
          testTimeout: 20_000,
          // Files share one database, content repository and mailbox.
          fileParallelism: false,
        },
      },
    ],
  },
});
