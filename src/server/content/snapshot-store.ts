// Prepared content of published revisions, stored in the database so the server needs no
// content files on disk. Only the active revision keeps its snapshot.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, ne } from 'drizzle-orm';
import type { Catalog, ContentModel, Exercise } from '../../lib/content/types';
import { getDb } from '../db/client';
import { contentAssets, contentRevisions, contentSnapshots } from '../db/schema';
import type { Snapshot } from './provider';

/** `Catalog` as JSON: the exercise maps are rebuilt from the parts on load. */
export type StoredModel = { courses: Omit<ContentModel, 'exercises'>[] };

type Db = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Saves a valid snapshot built from a checkout (`snapshot.dir` must still exist: the image
 * bytes are read from it).
 */
export async function saveSnapshot(tx: Db | Transaction, revisionId: string, snapshot: Snapshot): Promise<void> {
  const model = snapshot.result.model;
  if (!model || !snapshot.dir) throw new Error('Only a valid snapshot built from a directory can be saved.');
  const stored: StoredModel = { courses: model.courses.map(({ exercises: _exercises, ...course }) => course) };
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

/**
 * The stored snapshot of a revision, without image bytes, or undefined if there is none or it
 * was stored in the format from before multiple courses (it is then rebuilt).
 */
export async function loadSnapshot(revision: { id: string; sha: string }): Promise<Snapshot | undefined> {
  const db = getDb();
  const [row] = await db
    .select({ model: contentSnapshots.model, rendered: contentSnapshots.rendered, search: contentSnapshots.search, issues: contentRevisions.issues })
    .from(contentSnapshots)
    .innerJoin(contentRevisions, eq(contentRevisions.id, contentSnapshots.revisionId))
    .where(eq(contentSnapshots.revisionId, revision.id));
  if (!row || !Array.isArray(row.model.courses)) return undefined;

  const assets = await db
    .select({ path: contentAssets.path, contentType: contentAssets.contentType, width: contentAssets.width, height: contentAssets.height })
    .from(contentAssets)
    .where(eq(contentAssets.revisionId, revision.id));

  const catalog: Catalog = { courses: [], exercises: new Map() };
  for (const stored of row.model.courses) {
    const exercises = new Map<string, Exercise>();
    for (const lecture of stored.lectures) {
      for (const part of lecture.parts) for (const exercise of part.exercises) exercises.set(exercise.id, exercise);
    }
    for (const [id, exercise] of exercises) catalog.exercises.set(id, exercise);
    catalog.courses.push({ ...stored, exercises });
  }
  return {
    revision,
    result: { model: catalog, issues: row.issues },
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

/** Removes the snapshot of a revision, with its assets. */
export async function deleteSnapshot(tx: Db | Transaction, revisionId: string): Promise<void> {
  await tx.delete(contentSnapshots).where(eq(contentSnapshots.revisionId, revisionId));
}

/** Removes the snapshots of every revision except `keepRevisionId` (their history rows stay). */
export async function pruneSnapshots(tx: Db | Transaction, keepRevisionId: string): Promise<void> {
  await tx.delete(contentSnapshots).where(ne(contentSnapshots.revisionId, keepRevisionId));
}
