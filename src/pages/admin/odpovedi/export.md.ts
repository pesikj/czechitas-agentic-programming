import type { APIRoute } from 'astro';
import { exportFileName, markdownDownload, responsesToMarkdown } from '../../../lib/export';
import { findUserById } from '../../../server/auth/accounts';
import { getCourseContent } from '../../../server/content/provider';
import { groupByCourse, listResponses } from '../../../server/responses';

/** Administrators: answers of one learner or one exercise (or all) as Markdown. */
export const GET: APIRoute = async ({ locals, url }) => {
  if (locals.user?.role !== 'admin') return new Response('Přístup odepřen', { status: 403 });
  const userId = url.searchParams.get('uzivatel') || undefined;
  const exerciseId = url.searchParams.get('cviceni') || undefined;
  const courseId = url.searchParams.get('kurz') || undefined;
  if (userId && !/^[0-9a-f-]{36}$/i.test(userId)) return new Response('Neplatný účet', { status: 400 });
  const learner = userId ? await findUserById(userId) : undefined;
  const records = await listResponses({ ...(userId ? { userId } : {}), ...(exerciseId ? { exerciseId } : {}), ...(courseId ? { courseId } : {}) });
  const { model, catalog } = await getCourseContent();

  // Without a learner filter, each answer is labelled with its author.
  const labelled = groupByCourse(records, catalog).flatMap((group) =>
    group.records.map((record) => ({
      ...record,
      courseTitle: group.title,
      ...(learner ? {} : { exerciseTitle: `${record.email}: ${record.exerciseTitle ?? record.exerciseId}` }),
    })),
  );
  const markdown = responsesToMarkdown(labelled, {
    title: learner ? `Odpovědi – ${learner.email}` : 'Odpovědi studujících',
    subtitle: [model?.title, exerciseId ? `cvičení ${exerciseId}` : undefined].filter(Boolean).join(' · '),
  });
  return markdownDownload(markdown, exportFileName(learner ? `odpovedi-${learner.email}` : 'odpovedi'));
};
