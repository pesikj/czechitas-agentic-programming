// "Aktualizovat obsah" against a real git repository and database.
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../../src/server/db/client';
import { contentAssets, contentSnapshots } from '../../src/server/db/schema';
import { activateSnapshot, getContent, getRenderedPart, resolveAsset, searchContent } from '../../src/server/content/provider';
import { getActiveRevision, publishContent } from '../../src/server/content/publish';
import { CHECKOUT_PREFIX, repositorySettings } from '../../src/server/content/repository';
import { TEST_CONTENT_REPO } from '../../vitest.config';
import { commitAll } from '../support/content-repo';

const file = (relative: string) => path.join(TEST_CONTENT_REPO, relative);
const edit = (relative: string, change: (text: string) => string) =>
  writeFileSync(file(relative), change(readFileSync(file(relative), 'utf8')));
const IMAGE = 'lectures/01-zaklady/images/schema.png';
const ASSETS = [IMAGE, 'lectures/01-zaklady/skripty/analyza.py', 'lectures/01-zaklady/soubory/prodeje.csv'];

const storedRevisions = async () => (await getDb().select({ id: contentSnapshots.revisionId }).from(contentSnapshots)).map((row) => row.id);
const storedAssets = async (revisionId: string) =>
  (await getDb().select({ path: contentAssets.path }).from(contentAssets).where(eq(contentAssets.revisionId, revisionId)).orderBy(contentAssets.path)).map((row) => row.path);
const leftoverCheckouts = () => readdirSync(os.tmpdir()).filter((name) => name.startsWith(CHECKOUT_PREFIX));
/** Forgets the in-memory snapshot, as a fresh server process would. */
const forgetSnapshot = () => activateSnapshot({ result: { issues: [] }, assets: new Map(), rendered: new Map(), search: [] });

describe('content publishing', () => {
  it('starts empty, then publishes the branch only when an admin runs the update', async () => {
    const checkoutsBefore = leftoverCheckouts();
    expect((await getContent()).state).toBe('empty');

    const first = await publishContent(null);
    expect(first.status).toBe('activated');
    if (first.status !== 'activated') return;
    expect(first.revision.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(await storedRevisions()).toEqual([first.revision.id]);
    expect(await storedAssets(first.revision.id)).toEqual(ASSETS);
    expect(leftoverCheckouts()).toEqual(checkoutsBefore);

    const content = await getContent();
    expect(content.state).toBe('ready');
    expect(content.model?.title).toBe('Testovací kurz');
    const image = await resolveAsset(IMAGE);
    expect(image?.body).toEqual(readFileSync(file(IMAGE)));
    expect((await searchContent('úvod')).map((hit) => hit.partTitle)).toContain('Úvod');

    // A repository edit stays invisible until the next update.
    edit('course.yaml', (text) => text.replace('Testovací kurz', 'Upravený kurz'));
    commitAll(TEST_CONTENT_REPO, 'Rename course');
    expect((await getContent()).model?.title).toBe('Testovací kurz');

    const second = await publishContent(null);
    expect(second.status === 'activated' && second.unchanged).toBe(false);
    expect((await getContent()).model?.title).toBe('Upravený kurz');
    expect((await getActiveRevision())?.id).toBe(second.status === 'activated' ? second.revision.id : undefined);
    // Only the active revision keeps its stored content.
    expect(await storedRevisions()).toEqual([second.status === 'activated' ? second.revision.id : undefined]);
    expect(await storedAssets(first.revision.id)).toEqual([]);

    const again = await publishContent(null);
    expect(again.status === 'activated' && again.unchanged).toBe(true);
  });

  it('keeps the previous revision when the new one is invalid', async () => {
    const before = await getActiveRevision();
    renameSync(file('course.yaml'), file('course.yml'));
    commitAll(TEST_CONTENT_REPO, 'Break the course');

    const result = await publishContent(null);
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.message).toMatch(/1 chybu/);
    expect(result.issues.map((issue) => issue.code)).toContain('course-missing');
    expect((await getActiveRevision())?.id).toBe(before?.id);
    expect(await storedRevisions()).toEqual([before?.id]);
    expect((await getContent()).state).toBe('ready');

    renameSync(file('course.yml'), file('course.yaml'));
    commitAll(TEST_CONTENT_REPO, 'Fix the course');
    expect((await publishContent(null)).status).toBe('activated');
  });

  it('reports an unreachable repository or missing branch and keeps serving', async () => {
    const settings = { ...repositorySettings(), url: path.join(TEST_CONTENT_REPO, 'missing') };
    const unreachable = await publishContent(null, settings);
    expect(unreachable.status === 'failed' && unreachable.message).toMatch(/nepodařilo stáhnout/);

    const branch = await publishContent(null, { ...repositorySettings(), branch: 'neexistuje' });
    expect(branch.status === 'failed' && branch.message).toMatch(/Větev „neexistuje“/);
    expect((await getContent()).state).toBe('ready');
  });

  it('rejects unsafe branch names', async () => {
    const result = await publishContent(null, { ...repositorySettings(), branch: '--upload-pack=x' });
    expect(result.status === 'failed' && result.message).toMatch(/neplatný/);
  });

  it('serves the stored content after a restart', async () => {
    forgetSnapshot();
    const content = await getContent();
    expect(content.state).toBe('ready');
    expect(content.model?.exercises.size).toBeGreaterThan(0);
    const part = content.model!.lectures[0]!.parts[0]!;
    expect(await getRenderedPart(part)).toContain('src="/obsah/lectures/01-zaklady/images/schema.png"');
    expect((await resolveAsset(IMAGE))?.body).toEqual(readFileSync(file(IMAGE)));
    expect((await searchContent('úvod')).length).toBeGreaterThan(0);
  });

  it('rebuilds a missing snapshot from its commit', async () => {
    const active = (await getActiveRevision())!;
    // A newer commit on the branch must not replace the published one.
    edit('course.yaml', (text) => text.replace('Upravený kurz', 'Nepublikovaný kurz'));
    commitAll(TEST_CONTENT_REPO, 'Unpublished change');
    await getDb().delete(contentSnapshots);
    forgetSnapshot();

    const content = await getContent();
    expect(content.state).toBe('ready');
    expect(content.model?.title).toBe('Upravený kurz');
    expect(await storedRevisions()).toEqual([active.id]);
    expect(await storedAssets(active.id)).toEqual(ASSETS);
  });
});
