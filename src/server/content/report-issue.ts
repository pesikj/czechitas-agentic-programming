import { z } from 'zod';
import { lectureStatus } from '../../lib/lecture-status';
import { partHref } from '../../lib/navigation';
import { getConfig } from '../config';
import { getContent } from './provider';
import { createContentIssue, GithubIssueError, parseGithubRepository, type CreatedContentIssue } from './github-issues';

export const reportInputSchema = z.strictObject({
  courseId: z.string().min(1).max(100), lectureId: z.string().min(1).max(100), partId: z.string().min(1).max(100),
  revisionSha: z.string().regex(/^[0-9a-f]{40,64}$/).nullable(),
  body: z.string().max(20_000).refine((text) => text.trim().length > 0),
});
export type ReportInput = z.infer<typeof reportInputSchema>;
export class ContentReportError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const markdownText = (text: string) => text.replace(/[\\`*_{}\[\]()<>#!|]/g, '\\$&').replace(/[\r\n]+/g, ' ');

export async function submitContentReport(input: ReportInput, reporter: { email: string }): Promise<CreatedContentIssue> {
  const content = await getContent();
  const course = content.model?.courses.find((course) => course.id === input.courseId);
  const lecture = course?.lectures.find((lecture) => lecture.id === input.lectureId);
  const part = lecture?.parts.find((part) => part.id === input.partId);
  if (!course || !lecture || !part) throw new ContentReportError(404, 'Tato část už v aktuálních materiálech není.');
  if (lectureStatus(lecture) !== 'in-progress') throw new ContentReportError(409, 'Připomínky lze odesílat pouze k rozpracovaným lekcím.');
  if ((content.revision?.sha ?? null) !== input.revisionSha) throw new ContentReportError(409, 'Materiály se změnily. Zkopírujte si připomínku a obnovte stránku před dalším odesláním.');
  const config = getConfig();
  const repository = parseGithubRepository(config.CONTENT_REPO_URL);
  if (!repository || !config.CONTENT_REPO_TOKEN) throw new GithubIssueError('configuration');
  const pageUrl = new URL(partHref(lecture, part.id), config.APP_BASE_URL).href;
  const sourceUrl = content.revision
    ? `${repository.htmlUrl}/blob/${content.revision.sha}/${part.file.split('/').map(encodeURIComponent).join('/')}`
    : undefined;
  const metadata = [
    `Reportér: ${markdownText(reporter.email)}`,
    `Kurz: ${markdownText(course.title)} (${markdownText(course.id)})`,
    `Lekce: ${markdownText(lecture.title)} (${markdownText(lecture.id)})`,
    `Část: ${markdownText(part.title)} (${markdownText(part.id)})`,
    `Stránka: ${pageUrl}`,
    `Soubor: ${markdownText(part.file)}`,
    content.revision ? `Revize: ${content.revision.sha}` : 'Náhled: bez zveřejněné revize.',
    ...(sourceUrl ? [`Zdroj: ${sourceUrl}`] : []),
  ].join('\n\n');
  return createContentIssue({ repository, token: config.CONTENT_REPO_TOKEN, title: `[Content] ${lecture.title} / ${part.title}`, body: `${input.body}\n\n---\n\n${metadata}` });
}
