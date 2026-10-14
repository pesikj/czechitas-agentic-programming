import { TEST_CONTENT_REPO } from '../../vitest.config';
import { createContentRepo } from '../support/content-repo';
import { databaseUrlFor, prepareDatabase } from '../support/database';

export async function setup(): Promise<void> {
  // Always the dedicated test database, never the one in .env.
  await prepareDatabase(databaseUrlFor('course_test'));
  createContentRepo(TEST_CONTENT_REPO, 'fixtures/content/minimal');
}
