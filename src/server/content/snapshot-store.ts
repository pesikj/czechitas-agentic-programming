// Prepared content of published revisions, stored in the database so the server needs no
// content files on disk. Only the active revision keeps its snapshot.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, ne } from 'drizzle-orm';
import type { ContentModel, Exercise } from '../../lib/content/types';
import { getDb } from '../db/client';
import { contentAssets, contentRevisions, contentSnapshots } from '../db/schema';
import type { Snapshot } from './provider';

/** `ContentModel` as JSON: the exercise map is rebuilt from the parts on load. */
export type StoredModel = Omit<ContentModel, 'exercises'>;

type Db = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Saves a valid snapshot built from a checkout (`snapshot.dir` must still exist: the image
 * bytes are read from it).
 */
export async function saveSnapshot(tx: Db | Transaction, revisionId: string, snapshot: Snapshot): Promise<void> {
  const model = snapshot.result.model;
  if (!model || !snapshot.dir) throw new Error('Only a valid snapshot built from a directory can be saved.');
  const { exercises: _exercises, ...stored } = model;
  await tx.insert(contentSnapshots).values({
    revisionId,
    model: stored,
    rendered: Object.fromEntries(snapshot.rendered),
    search: snapshot.search,
  });
  for (const asset of snapshot.assets.values()) {
    await tx.insert(contentAssets).values({
      revisionId,
      path: asset.path,
      contentType: asset.contentType,
      width: asset.width ?? null,
      height: asset.height ?? null,
      data: await readFile(path.join(snapshot.dir, asset.path)),
    });
  }
}

/** The stored snapshot of a revision, without image bytes, or undefined if there is none. */
export async function loadSnapshot(revision: { id: string; sha: string }): Promise<Snapshot | undefined> {
  const db = getDb();
  const [row] = await db
    .select({ model: contentSnapshots.model, rendered: contentSnapshots.rendered, search: contentSnapshots.search, issues: contentRevisions.issues })
    .from(contentSnapshots)
    .innerJoin(contentRevisions, eq(contentRevisions.id, contentSnapshots.revisionId))
    .where(eq(contentSnapshots.revisionId, revision.id));
  if (!row) return undefined;

  const assets = await db
    .select({ path: contentAssets.path, contentType: contentAssets.contentType, width: contentAssets.width, height: contentAssets.height })
    .from(contentAssets)
    .where(eq(contentAssets.revisionId, revision.id));

  const exercises = new Map<string, Exercise>();
  for (const lecture of row.model.lectures) {
    for (const part of lecture.parts) for (const exercise of part.exercises) exercises.set(exercise.id, exercise);
  }
  return {
    revision,
    result: { model: { ...row.model, exercises }, issues: row.issues },
    assets: new Map(
      assets.map((asset) => [
        asset.path,
        {
          path: asset.path,
          contentType: asset.contentType,
          ...(asset.width ? { width: asset.width } : {}),
          ...(asset.height ? { height: asset.height } : {}),
        },
      ]),
    ),
    rendered: new Map(Object.entries(row.rendered)),
    search: row.search,
  };
}

export async function readAsset(revisionId: string, repoPath: string): Promise<Buffer | undefined> {
  const [row] = await getDb()
    .select({ data: contentAssets.data })
    .from(contentAssets)
    .where(and(eq(contentAssets.revisionId, revisionId), eq(contentAssets.path, repoPath)));
  return row?.data;
}

/** Removes the snapshots of every revision except `keepRevisionId` (their history rows stay). */
export async function pruneSnapshots(tx: Db | Transaction, keepRevisionId: string): Promise<void> {
  await tx.delete(contentSnapshots).where(ne(contentSnapshots.revisionId, keepRevisionId));
}
