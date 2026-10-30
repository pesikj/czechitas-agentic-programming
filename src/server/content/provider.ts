// Supplies the content shown to learners: the administrator-published revision (stored in the
// database), or, in the optional preview mode (CONTENT_DIR), a directory read directly. Each
// snapshot holds the navigation model, rendered pages, images and search index of one revision,
// for every course of the repository.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { imageSize } from 'image-size';
import { loadContent, renderMarkdown, type ImageResolution, type LinkResolution } from '../../lib/content/index';
import type { CourseTarget } from '../../lib/commands';
import type { Catalog, ContentModel, LoadResult, Part, ValidationIssue } from '../../lib/content/types';
import { courseTargets } from '../../lib/navigation';
import { buildSearchIndex, search as searchIndex, type SearchDocument, type SearchHit } from '../../lib/search';
import { getConfig } from '../config';
import { getDb } from '../db/client';
import { checkoutRevision, repositorySettings } from './repository';
import { getActiveRevision } from './revisions';
import { deleteSnapshot, loadSnapshot, readAsset, saveSnapshot } from './snapshot-store';

const ASSET_ROUTE = '/obsah/';

/** Servable types by lowercase file extension: images, then downloadable files. */
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.parquet': 'application/vnd.apache.parquet',
  '.py': 'text/x-python; charset=utf-8',
  '.ipynb': 'application/x-ipynb+json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.sql': 'application/sql; charset=utf-8',
  '.sh': 'application/x-sh; charset=utf-8',
  '.ps1': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
  '.pdf': 'application/pdf',
};

/** Content type served for a repository path, or undefined if the type is not servable. */
export function contentTypeOf(repoPath: string): string | undefined {
  return CONTENT_TYPES[path.extname(repoPath).toLowerCase()];
}

export interface SnapshotAsset {
  /** Path relative to the repository root. */
  path: string;
  contentType: string;
  width?: number;
  height?: number;
}

export interface Snapshot {
  /** The published revision, or undefined in preview mode. */
  revision?: { id: string; sha: string };
  /**
   * The directory the snapshot was built from. Published snapshots are served from the
   * database, so for them it only exists until the checkout is disposed.
   */
  dir?: string;
  result: LoadResult;
  /** Existing, servable images and linked files by repository-relative path. */
  assets: Map<string, SnapshotAsset>;
  /** Sanitized HTML by `lectureId/partId` (lecture ids are unique across the courses). */
  rendered: Map<string, string>;
  /** The search documents of every course. */
  search: SearchDocument[];
}

export type ContentState =
  | (LoadResult & { state: 'ready' | 'invalid'; revision?: Snapshot['revision'] })
  | { state: 'empty'; model?: undefined; issues: []; revision?: undefined };

let active: Snapshot | undefined;
let preview: { fingerprint: string; snapshot: Promise<Snapshot> } | undefined;
let loading: { revisionId: string; snapshot: Promise<Snapshot> } | undefined;

/** URL under which a repository asset is served. */
export function assetUrl(repoPath: string): string {
  return ASSET_ROUTE + repoPath.split('/').map(encodeURIComponent).join('/');
}

/** Loads, validates and prepares everything for one revision directory. */
export async function buildSnapshot(dir: string, revision?: Snapshot['revision']): Promise<Snapshot> {
  const result = await loadContent(dir);
  const assets: Snapshot['assets'] = new Map();
  const rendered = new Map<string, string>();
  const lectures = result.model?.courses.flatMap((course) => course.lectures) ?? [];
  for (const lecture of lectures) {
    for (const part of lecture.parts) {
      for (const asset of part.assets) {
        const contentType = contentTypeOf(asset.path);
        if (!asset.exists || !contentType || assets.has(asset.path)) continue;
        const dimensions = contentType.startsWith('image/') ? await dimensionsOf(path.join(dir, asset.path)) : {};
        assets.set(asset.path, { path: asset.path, contentType, ...dimensions });
      }
    }
  }
  for (const lecture of lectures) {
    for (const part of lecture.parts) rendered.set(key(part), await render(part, assets));
  }
  const search = result.model?.courses.flatMap((course) => buildSearchIndex(course)) ?? [];
  return { ...(revision ? { revision } : {}), dir, result, assets, rendered, search };
}

/** Switches learners to a prepared snapshot (after the database marks it active). */
export function activateSnapshot(snapshot: Snapshot): void {
  active = snapshot;
}

const key = (part: Pick<Part, 'lectureId' | 'id'>) => `${part.lectureId}/${part.id}`;

function render(part: Part, assets: Snapshot['assets']): Promise<string> {
  const byUrl = new Map(part.assets.filter((asset) => asset.kind === 'image').map((asset) => [asset.url, asset]));
  const filesByUrl = new Map(part.assets.filter((asset) => asset.kind === 'file').map((asset) => [asset.url, asset]));
  return renderMarkdown(part.source, {
    mode: 'content',
    shiftHeadings: 1,
    omitLeadingHeading: part.title,
    resolveImage(url): ImageResolution | undefined {
      const asset = byUrl.get(url);
      if (!asset) return undefined;
      const served = assets.get(asset.path);
      if (!served) return { missing: true };
      return {
        src: assetUrl(served.path),
        ...(served.width ? { width: served.width } : {}),
        ...(served.height ? { height: served.height } : {}),
      };
    },
    resolveLink(url): LinkResolution | undefined {
      const asset = filesByUrl.get(url);
      if (!asset) return undefined;
      const served = assets.get(asset.path);
      return served ? { href: assetUrl(served.path) } : { missing: true };
    },
  });
}

async function dimensionsOf(file: string): Promise<{ width?: number; height?: number }> {
  try {
    const { width, height } = imageSize(await readFile(file));
    return width && height ? { width, height } : {};
  } catch {
    return {};
  }
}

async function currentSnapshot(): Promise<Snapshot | undefined> {
  const previewDir = getConfig().CONTENT_DIR;
  if (previewDir) return previewSnapshot(path.resolve(previewDir));

  // One small query per request keeps every server process on the active revision.
  const revision = await getActiveRevision();
  if (!revision?.commitSha) return undefined;
  if (active?.revision?.id === revision.id) return active;
  if (loading?.revisionId !== revision.id) {
    const published = { id: revision.id, sha: revision.commitSha };
    loading = { revisionId: revision.id, snapshot: loadSnapshot(published).then((stored) => stored ?? rebuildSnapshot(published)) };
  }
  const snapshot = await loading.snapshot;
  if (loading?.revisionId === revision.id) loading = undefined;
  active = snapshot;
  return snapshot;
}

/**
 * Rebuilds a published revision whose snapshot is missing (published before snapshots were
 * stored, or removed by hand) or stored in an old format, from its commit, and stores it again.
 */
async function rebuildSnapshot(revision: { id: string; sha: string }): Promise<Snapshot> {
  const checkout = await checkoutRevision(repositorySettings(), revision.sha);
  try {
    const snapshot = await buildSnapshot(checkout.dir, revision);
    if (snapshot.result.model) {
      // Deletes any stored row first (a no-op if none), so an old-format row is replaced with its assets cascading.
      const replace = getDb().transaction(async (tx) => {
        await deleteSnapshot(tx, revision.id);
        await saveSnapshot(tx, revision.id, snapshot);
      });
      await replace.catch((error: unknown) => {
        // Another server process stored it first.
        if ((error as { code?: string }).code !== '23505') throw error;
      });
    }
    return snapshot;
  } finally {
    await checkout.dispose();
  }
}

/** Preview mode re-reads the directory when any file changes. */
async function previewSnapshot(dir: string): Promise<Snapshot> {
  const fingerprint = await fingerprintOf(dir);
  if (!preview || preview.fingerprint !== fingerprint) preview = { fingerprint, snapshot: buildSnapshot(dir) };
  return preview.snapshot;
}

/** Cheap change detection: paths, sizes and modification times of all files. */
async function fingerprintOf(dir: string): Promise<string> {
  const entries = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
  const parts: string[] = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith('.git')) continue;
    const stats = await stat(path.join(dir, entry)).catch(() => undefined);
    if (stats?.isFile()) parts.push(`${entry}:${stats.size}:${stats.mtimeMs}`);
  }
  return parts.join('|');
}

/**
 * The content learners currently see, with every course. `empty` means nothing has been
 * published yet.
 */
export async function getContent(): Promise<ContentState> {
  const snapshot = await currentSnapshot();
  if (!snapshot) return { state: 'empty', issues: [] };
  return {
    ...snapshot.result,
    state: snapshot.result.model ? 'ready' : 'invalid',
    ...(snapshot.revision ? { revision: snapshot.revision } : {}),
  };
}

export interface CourseContent {
  state: ContentState['state'];
  issues: ValidationIssue[];
  revision?: { id: string; sha: string };
  catalog?: Catalog;
  /** The requested course; undefined if the content is empty/invalid or the id is unknown. */
  model?: ContentModel;
  courses: CourseTarget[];
}

/** One course of the current content; the main course when `courseId` is omitted. */
export async function getCourseContent(courseId?: string): Promise<CourseContent> {
  const { state, issues, revision, model: catalog } = await getContent();
  if (!catalog) return { state, issues, ...(revision ? { revision } : {}), courses: [] };
  const id = courseId ?? catalog.courses[0]!.id;
  const model = catalog.courses.find((course) => course.id === id);
  return { state, issues, ...(revision ? { revision } : {}), catalog, ...(model ? { model } : {}), courses: courseTargets(catalog) };
}

/** Sanitized HTML of a part, with image URLs pointing at the protected asset route. */
export async function getRenderedPart(part: Part): Promise<string> {
  const snapshot = await currentSnapshot();
  return snapshot?.rendered.get(key(part)) ?? '';
}

/** Search within one course. */
export async function searchContent(query: string, courseId: string): Promise<SearchHit[]> {
  const snapshot = await currentSnapshot();
  return snapshot ? searchIndex(snapshot.search.filter((document) => document.courseId === courseId), query) : [];
}

/**
 * A servable image or linked file of the current content, or undefined. Only files referenced by
 * the current content are served, so other repository files are never exposed.
 */
export async function resolveAsset(repoPath: string): Promise<{ path: string; body: Buffer; contentType: string } | undefined> {
  const snapshot = await currentSnapshot();
  const asset = snapshot?.result.model ? snapshot.assets.get(repoPath) : undefined;
  if (!snapshot || !asset) return undefined;
  const body = snapshot.revision
    ? await readAsset(snapshot.revision.id, asset.path)
    : await readFile(path.join(snapshot.dir!, asset.path)).catch(() => undefined);
  return body ? { path: asset.path, body, contentType: asset.contentType } : undefined;
}
