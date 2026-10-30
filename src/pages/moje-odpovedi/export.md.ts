import type { APIRoute } from 'astro';
import { exportCourseTitle, exportFileName, markdownDownload, responsesToMarkdown } from '../../lib/export';
import { getCourseContent } from '../../server/content/provider';
import { groupByCourse, listResponses } from '../../server/responses';

/** The signed-in learner's own answers (all, or one exercise) as Markdown. */
export const GET: APIRoute = async ({ locals, url }) => {
  const user = locals.user!;
  const exerciseId = url.searchParams.get('cviceni') ?? undefined;
  const records = await listResponses({ userId: user.id, ...(exerciseId ? { exerciseId } : {}) });
  const { catalog } = await getCourseContent();
  const groups = groupByCourse(records, catalog);
  const grouped = groups.flatMap((group) => group.records.map((record) => ({ ...record, courseTitle: group.title })));
  const markdown = responsesToMarkdown(grouped, {
    title: exerciseId ? `Moje odpověď – ${grouped[0]?.exerciseTitle ?? exerciseId}` : 'Moje odpovědi',
    subtitle: [exportCourseTitle(groups), user.email].filter(Boolean).join(' · '),
  });
  return markdownDownload(markdown, exportFileName(exerciseId ? `odpoved-${exerciseId}` : 'moje-odpovedi'));
};
