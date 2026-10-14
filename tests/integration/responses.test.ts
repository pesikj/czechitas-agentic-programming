// Saved responses against the test database.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteAccount } from '../../src/server/auth/accounts';
import { hashPassword } from '../../src/server/auth/password';
import { getDb } from '../../src/server/db/client';
import { users } from '../../src/server/db/schema';
import { buildSnapshot } from '../../src/server/content/provider';
import { countResponses, getResponse, listResponses, revisionNote, saveResponse } from '../../src/server/responses';
import { testAddress } from '../support/mailpit';

const { result } = await buildSnapshot(path.resolve('fixtures/content/minimal'));
const model = result.model!;
const exercise = model.exercises.get('prvni-prompt')!;

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
    const first = await saveResponse({ userId: user.id, exercise, model, fields: { prompt: 'První verze', vysledek: '', reflexe: '' } });
    expect(first.ok).toBe(true);
    const second = await saveResponse({ userId: user.id, exercise, model, fields: { prompt: 'Druhá **verze**', reflexe: 'Ok', ignored: 'x' } });
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
    expect(await saveResponse({ userId: user.id, exercise, model, fields: { prompt: '  ', reflexe: '\n' } })).toEqual({
      ok: false,
      error: 'Odpověď je prázdná. Vyplňte alespoň jedno pole.',
    });
    const long = await saveResponse({ userId: user.id, exercise, model, fields: { prompt: 'x'.repeat(20_001) } });
    expect(long.ok).toBe(false);
    expect(await getResponse(user.id, exercise.id)).toBeUndefined();
  });

  it('separates learners and supports admin filters', async () => {
    const a = await learner('filter-a');
    const b = await learner('filter-b');
    await saveResponse({ userId: a.id, exercise, model, fields: { prompt: 'A' } });
    await saveResponse({ userId: b.id, exercise, model, fields: { prompt: 'B' } });
    expect((await listResponses({ userId: a.id })).map((record) => record.fields.prompt)).toEqual(['A']);
    const all = await listResponses({ exerciseId: exercise.id });
    expect(all.map((record) => record.email)).toEqual(expect.arrayContaining([a.email, b.email]));
  });

  it('flags answers to an older or removed exercise', async () => {
    const user = await learner('revision');
    await saveResponse({ userId: user.id, exercise, model, fields: { prompt: 'Starší' } });
    const record = (await getResponse(user.id, exercise.id))!;
    expect(revisionNote(record, model)).toBe('current');
    const revised = { ...model, exercises: new Map([[exercise.id, { ...exercise, revision: 2 }]]) };
    expect(revisionNote(record, revised)).toBe('older-revision');
    expect(revisionNote(record, { ...model, exercises: new Map() })).toBe('removed');
  });

  it('deleting an account removes its answers (retention policy)', async () => {
    const admin = await learner('resp-admin');
    const user = await learner('resp-delete');
    await saveResponse({ userId: user.id, exercise, model, fields: { prompt: 'Smazat' } });
    expect((await deleteAccount(admin.id, user.id, user.email)).ok).toBe(true);
    expect(await countResponses(user.id)).toBe(0);
  });
});
