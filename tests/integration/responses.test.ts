// Saved responses against the test database.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteAccount } from '../../src/server/auth/accounts';
import { hashPassword } from '../../src/server/auth/password';
import { getDb } from '../../src/server/db/client';
import { users } from '../../src/server/db/schema';
import { buildSnapshot } from '../../src/server/content/provider';
import { countResponses, getResponse, groupByCourse, listResponses, revisionNote, saveResponse } from '../../src/server/responses';
import { testAddress } from '../support/mailpit';

const { result } = await buildSnapshot(path.resolve('fixtures/content/minimal'));
const catalog = result.model!;
const exercise = catalog.exercises.get('prvni-prompt')!;

const { result: twoCourses } = await buildSnapshot(path.resolve('fixtures/content/courses'));
const multiCatalog = twoCourses.model!;
const mainExercise = multiCatalog.exercises.get('prvni-prompt')!;
const dataExercise = multiCatalog.exercises.get('prvni-tabulka')!;

async function learner(label: string) {
  const [user] = await getDb()
    .insert(users)
    .values({ email: testAddress(label), status: 'active', passwordHash: await hashPassword('x'.repeat(12)), mustChangePassword: false })
    .returning();
  return user!;
}

describe('saved responses', () => {
  it('keeps one current answer per learner and exercise, last save wins', async () => {
    const user = await learner('answer');
    const first = await saveResponse({ userId: user.id, exercise, catalog, fields: { prompt: 'První verze', vysledek: '', reflexe: '' } });
    expect(first.ok).toBe(true);
    const second = await saveResponse({ userId: user.id, exercise, catalog, fields: { prompt: 'Druhá **verze**', reflexe: 'Ok', ignored: 'x' } });
    expect(second.ok).toBe(true);

    const saved = await getResponse(user.id, exercise.id);
    expect(saved).toMatchObject({
      exerciseRevision: 1,
      lectureId: 'zaklady',
      partId: 'prvni-cviceni',
      lectureTitle: 'Základy práce s agentem',
      partTitle: 'První cvičení',
      exerciseTitle: 'Váš první prompt',
      fieldLabels: { prompt: 'Použitý prompt', vysledek: 'Výsledek a ověření', reflexe: 'Reflexe' },
      fields: { prompt: 'Druhá **verze**', vysledek: '', reflexe: 'Ok' },
    });
    expect(await countResponses(user.id)).toBe(1);
  });

  it('rejects empty and over-long answers', async () => {
    const user = await learner('invalid-answer');
    expect(await saveResponse({ userId: user.id, exercise, catalog, fields: { prompt: '  ', reflexe: '\n' } })).toEqual({
      ok: false,
      error: 'Odpověď je prázdná. Vyplňte alespoň jedno pole.',
    });
    const long = await saveResponse({ userId: user.id, exercise, catalog, fields: { prompt: 'x'.repeat(20_001) } });
    expect(long.ok).toBe(false);
    expect(await getResponse(user.id, exercise.id)).toBeUndefined();
  });

  it('separates learners and supports admin filters', async () => {
    const a = await learner('filter-a');
    const b = await learner('filter-b');
    await saveResponse({ userId: a.id, exercise, catalog, fields: { prompt: 'A' } });
    await saveResponse({ userId: b.id, exercise, catalog, fields: { prompt: 'B' } });
    expect((await listResponses({ userId: a.id })).map((record) => record.fields.prompt)).toEqual(['A']);
    const all = await listResponses({ exerciseId: exercise.id });
    expect(all.map((record) => record.email)).toEqual(expect.arrayContaining([a.email, b.email]));
  });

  it('flags answers to an older or removed exercise', async () => {
    const user = await learner('revision');
    await saveResponse({ userId: user.id, exercise, catalog, fields: { prompt: 'Starší' } });
    const record = (await getResponse(user.id, exercise.id))!;
    expect(revisionNote(record, catalog.exercises)).toBe('current');
    expect(revisionNote(record, new Map([[exercise.id, { ...exercise, revision: 2 }]]))).toBe('older-revision');
    expect(revisionNote(record, new Map())).toBe('removed');
  });

  it('deleting an account removes its answers (retention policy)', async () => {
    const admin = await learner('resp-admin');
    const user = await learner('resp-delete');
    await saveResponse({ userId: user.id, exercise, catalog, fields: { prompt: 'Smazat' } });
    expect((await deleteAccount(admin.id, user.id, user.email)).ok).toBe(true);
    expect(await countResponses(user.id)).toBe(0);
  });

  it('stores the course of the exercise, filters by it and groups in catalog order', async () => {
    const user = await learner('courses');
    // The data answer is saved first, so the order below comes from the catalog, not from saving.
    await saveResponse({ userId: user.id, exercise: dataExercise, catalog: multiCatalog, fields: { postup: 'Tabulka' } });
    await saveResponse({ userId: user.id, exercise: mainExercise, catalog: multiCatalog, fields: { prompt: 'Prompt' } });
    expect((await getResponse(user.id, 'prvni-tabulka'))?.courseId).toBe('data');
    expect((await getResponse(user.id, 'prvni-prompt'))?.courseId).toBe('agent');

    const dataOnly = await listResponses({ userId: user.id, courseId: 'data' });
    expect(dataOnly.map((record) => record.exerciseId)).toEqual(['prvni-tabulka']);

    const groups = groupByCourse(await listResponses({ userId: user.id }), multiCatalog);
    expect(groups.map((group) => [group.courseId, group.title, group.records.map((record) => record.exerciseId)])).toEqual([
      ['agent', 'Testovací kurz', ['prvni-prompt']],
      ['data', 'Digitální akademie: Data', ['prvni-tabulka']],
    ]);
  });

  it('puts unknown courses last under their id and omits empty groups', () => {
    const groups = groupByCourse([{ courseId: 'zmizely' }, { courseId: 'data' }], multiCatalog);
    expect(groups.map((group) => [group.courseId, group.title])).toEqual([
      ['data', 'Digitální akademie: Data'],
      ['zmizely', 'zmizely'],
    ]);
  });
});
