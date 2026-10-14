import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { contentRevisions } from '../db/schema';

export type ContentRevision = typeof contentRevisions.$inferSelect;

export async function getActiveRevision(): Promise<ContentRevision | undefined> {
  const [revision] = await getDb().select().from(contentRevisions).where(eq(contentRevisions.status, 'active')).limit(1);
  return revision;
}

export async function listRevisionRuns(limit = 10): Promise<ContentRevision[]> {
  return getDb().select().from(contentRevisions).orderBy(desc(contentRevisions.startedAt)).limit(limit);
}
