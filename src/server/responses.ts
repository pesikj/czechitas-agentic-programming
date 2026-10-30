// Saved exercise responses: one current answer per learner and exercise (last save wins).
// No drafts, history, grading or progress are stored.
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Catalog, Exercise } from '../lib/content/types';
import { getDb } from './db/client';
import { responses, users } from './db/schema';

export type ResponseRecord = typeof responses.$inferSelect;
export type ResponseWithUser = ResponseRecord & { email: string };

export const MAX_FIELD_LENGTH = 20_000;

export async function getResponse(userId: string, exerciseId: string): Promise<ResponseRecord | undefined> {
  const [record] = await getDb()
    .select()
    .from(responses)
    .where(and(eq(responses.userId, userId), eq(responses.exerciseId, exerciseId)))
    .limit(1);
  return record;
}

export async function countResponses(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(responses)
    .where(eq(responses.userId, userId));
  return row?.count ?? 0;
}

export async function listResponses(filter: { userId?: string; exerciseId?: string; courseId?: string }): Promise<ResponseWithUser[]> {
  const conditions = [
    filter.userId ? eq(responses.userId, filter.userId) : undefined,
    filter.exerciseId ? eq(responses.exerciseId, filter.exerciseId) : undefined,
    filter.courseId ? eq(responses.courseId, filter.courseId) : undefined,
  ].filter((condition) => condition !== undefined);
  const rows = await getDb()
    .select({ response: responses, email: users.email })
    .from(responses)
    .innerJoin(users, eq(responses.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(responses.savedAt));
  return rows.map((row) => ({ ...row.response, email: row.email }));
}

/** Learners and exercises that have saved answers, for the admin filters. */
export async function responseFilterOptions() {
  const db = getDb();
  const learners = await db
    .selectDistinct({ id: users.id, email: users.email })
    .from(responses)
    .innerJoin(users, eq(responses.userId, users.id))
    .orderBy(asc(users.email));
  const exercises = await db
    .select({ id: responses.exerciseId, title: sql<string | null>`max(${responses.exerciseTitle})` })
    .from(responses)
    .groupBy(responses.exerciseId)
    .orderBy(asc(responses.exerciseId));
  return { learners, exercises };
}

export type SaveResult = { ok: true; savedAt: Date } | { ok: false; error: string };

/**
 * Replaces the learner's saved answer. Only the exercise's own fields are kept; every save
 * records the exercise revision and the published content revision it refers to.
 */
export async function saveResponse(input: {
  userId: string;
  exercise: Exercise;
  catalog: Catalog;
  contentRevisionId?: string;
  fields: Record<string, string>;
}): Promise<SaveResult> {
  const { exercise, catalog } = input;
  const fields: Record<string, string> = {};
  for (const field of exercise.fields) {
    const value = (input.fields[field.id] ?? '').replace(/\r\n/g, '\n');
    if (value.length > MAX_FIELD_LENGTH) {
      return { ok: false, error: `Pole „${field.label}“ je příliš dlouhé (nejvýše ${MAX_FIELD_LENGTH.toLocaleString('cs-CZ')} znaků).` };
    }
    fields[field.id] = value;
  }
  if (Object.values(fields).every((value) => value.trim() === '')) {
    return { ok: false, error: 'Odpověď je prázdná. Vyplňte alespoň jedno pole.' };
  }

  const course = catalog.courses.find((candidate) => candidate.id === exercise.courseId);
  const lecture = course?.lectures.find((candidate) => candidate.id === exercise.lectureId);
  const part = lecture?.parts.find((candidate) => candidate.id === exercise.partId);
  const values = {
    courseId: exercise.courseId,
    exerciseRevision: exercise.revision,
    contentRevisionId: input.contentRevisionId ?? null,
    lectureId: exercise.lectureId,
    partId: exercise.partId,
    lectureTitle: lecture?.title ?? null,
    partTitle: part?.title ?? null,
    exerciseTitle: exercise.title ?? null,
    fieldLabels: Object.fromEntries(exercise.fields.map((field) => [field.id, field.label])),
    fields,
    savedAt: new Date(),
  };
  const [saved] = await getDb()
    .insert(responses)
    .values({ userId: input.userId, exerciseId: exercise.id, ...values })
    .onConflictDoUpdate({ target: [responses.userId, responses.exerciseId], set: values })
    .returning({ savedAt: responses.savedAt });
  return { ok: true, savedAt: saved!.savedAt };
}

/** Splits answers by course: catalog order first, unknown course ids last (titled by their id). */
export function groupByCourse<T extends { courseId: string }>(
  records: T[],
  catalog: Catalog | undefined,
): { courseId: string; title: string; records: T[] }[] {
  const known = (catalog?.courses ?? []).map((course) => ({ courseId: course.id, title: course.title }));
  const unknown = [...new Set(records.map((record) => record.courseId))]
    .filter((courseId) => !known.some((course) => course.courseId === courseId))
    .map((courseId) => ({ courseId, title: courseId }));
  return [...known, ...unknown]
    .map((course) => ({ ...course, records: records.filter((record) => record.courseId === course.courseId) }))
    .filter((group) => group.records.length > 0);
}

export type RevisionNote = 'current' | 'older-revision' | 'removed';

/** How a saved answer relates to the currently published exercise. */
export function revisionNote(
  record: Pick<ResponseRecord, 'exerciseId' | 'exerciseRevision'>,
  exercises: Map<string, Exercise> | undefined,
): RevisionNote {
  const current = exercises?.get(record.exerciseId);
  if (!current) return 'removed';
  return current.revision === record.exerciseRevision ? 'current' : 'older-revision';
}
