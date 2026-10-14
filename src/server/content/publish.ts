// "Aktualizovat obsah": fetch → validate → prepare → store → activate, all for one commit.
// A failed run leaves the previously active revision untouched.
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { contentRevisions } from '../db/schema';
import type { ValidationIssue } from '../../lib/content/types';
import { buildSnapshot, activateSnapshot } from './provider';
import { checkoutRevision, PublishError, repositorySettings, type Checkout, type RepositorySettings } from './repository';
import { getActiveRevision, type ContentRevision } from './revisions';
import { pruneSnapshots, saveSnapshot } from './snapshot-store';

export { getActiveRevision, listRevisionRuns, type ContentRevision } from './revisions';

export type PublishResult =
  | { status: 'activated'; revision: ContentRevision; unchanged: boolean }
  | { status: 'failed'; revision: ContentRevision; message: string; issues: ValidationIssue[] }
  | { status: 'busy' };

const STALE_MINUTES = 10;

let running = false;

export async function publishContent(
  triggeredBy: string | null,
  settings: RepositorySettings = repositorySettings(),
): Promise<PublishResult> {
  if (running) return { status: 'busy' };
  running = true;
  try {
    return await publish(triggeredBy, settings);
  } finally {
    running = false;
  }
}

async function publish(triggeredBy: string | null, settings: RepositorySettings): Promise<PublishResult> {
  const db = getDb();
  // A run interrupted by a crash or restart must not block updates forever.
  await db
    .update(contentRevisions)
    .set({ status: 'failed', errorMessage: 'Aktualizace byla přerušena (například restartem serveru).', finishedAt: new Date() })
    .where(
      and(
        inArray(contentRevisions.status, ['pending', 'validating']),
        lt(contentRevisions.startedAt, sql`now() - make_interval(mins => ${STALE_MINUTES})`),
      ),
    );

  let run: ContentRevision;
  try {
    [run] = (await db.insert(contentRevisions).values({ status: 'pending', triggeredBy }).returning()) as [ContentRevision];
  } catch (error) {
    // The partial unique index allows only one run in progress (another server request).
    if ((error as { code?: string }).code === '23505') return { status: 'busy' };
    throw error;
  }

  const fail = async (message: string, issues: ValidationIssue[] = []): Promise<PublishResult> => {
    const [revision] = (await db
      .update(contentRevisions)
      .set({ status: 'failed', errorMessage: message, issues, finishedAt: new Date() })
      .where(eq(contentRevisions.id, run.id))
      .returning()) as [ContentRevision];
    return { status: 'failed', revision, message, issues };
  };

  let checkout: Checkout | undefined;
  try {
    checkout = await checkoutRevision(settings);
    const { sha } = checkout;
    await db.update(contentRevisions).set({ commitSha: sha, status: 'validating' }).where(eq(contentRevisions.id, run.id));

    // Validate and prepare navigation, pages, images and search for this commit.
    const snapshot = await buildSnapshot(checkout.dir, { id: run.id, sha });
    const issues = snapshot.result.issues;
    if (!snapshot.result.model) {
      const errors = issues.filter((issue) => issue.severity === 'error').length;
      return await fail(`Obsah obsahuje ${errors} ${errors === 1 ? 'chybu' : errors < 5 ? 'chyby' : 'chyb'}; zůstává předchozí verze.`, issues);
    }

    const previous = await getActiveRevision();
    const revision = await db.transaction(async (tx) => {
      await saveSnapshot(tx, run.id, snapshot);
      await tx.update(contentRevisions).set({ status: 'superseded' }).where(eq(contentRevisions.status, 'active'));
      const [activated] = (await tx
        .update(contentRevisions)
        .set({ status: 'active', issues, finishedAt: new Date(), activatedAt: new Date() })
        .where(eq(contentRevisions.id, run.id))
        .returning()) as [ContentRevision];
      await pruneSnapshots(tx, run.id);
      return activated;
    });
    activateSnapshot(snapshot);
    return { status: 'activated', revision, unchanged: previous?.commitSha === sha };
  } catch (error) {
    if (error instanceof PublishError) return fail(error.message);
    console.error('Content update failed', error);
    return fail(`Neočekávaná chyba: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await checkout?.dispose();
  }
}
