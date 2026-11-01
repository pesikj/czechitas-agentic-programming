import type { APIRoute } from 'astro';
import { getConfig } from '../../server/config';
import { RateLimiter } from '../../server/auth/rate-limit';
import { GithubIssueError, parseGithubRepository } from '../../server/content/github-issues';
import { ContentReportError, reportInputSchema, submitContentReport } from '../../server/content/report-issue';

const attempts = new RateLimiter(5, 60_000);
const MAX_BYTES = 32 * 1024;
const reply = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new ContentReportError(413, 'Připomínka je příliš dlouhá.');
  const reader = request.body?.getReader();
  if (!reader) throw new ContentReportError(400, 'Vyplňte připomínku.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        void reader.cancel();
        throw new ContentReportError(413, 'Připomínka je příliš dlouhá.');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof ContentReportError) throw error;
    throw new ContentReportError(400, 'Neplatný požadavek.');
  } finally { reader.releaseLock(); }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return reply(401, { ok: false, message: 'Přihlaste se.' });
  if (user.role !== 'admin') return reply(403, { ok: false, message: 'Připomínky mohou odesílat jen administrátoři.' });
  const config = getConfig();
  if (request.headers.get('origin') !== new URL(config.APP_BASE_URL).origin) return reply(403, { ok: false, message: 'Neplatný původ požadavku.' });
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return reply(415, { ok: false, message: 'Požadavek musí být JSON.' });
  if (!attempts.hit(user.id)) return reply(429, { ok: false, message: 'Příliš mnoho připomínek. Počkejte minutu před dalším odesláním.' });
  try {
    const parsed = reportInputSchema.safeParse(await readJson(request));
    if (!parsed.success) return reply(400, { ok: false, message: 'Vyplňte připomínku (nejvýše 20 000 znaků). Požadavek musí obsahovat platný odkaz na část lekce.' });
    const issue = await submitContentReport(parsed.data, { email: user.email });
    return reply(201, { ok: true, issueUrl: issue.url, ...(issue.assignmentWarning ? { assignmentWarning: issue.assignmentWarning } : {}) });
  } catch (error) {
    if (error instanceof ContentReportError) return reply(error.status, { ok: false, message: error.message });
    if (error instanceof GithubIssueError) {
      const repository = parseGithubRepository(config.CONTENT_REPO_URL);
      return reply(503, { ok: false, message: error.message, ...(error.kind === 'ambiguous' ? { ambiguous: true, ...(repository ? { repositoryIssuesUrl: `${repository.htmlUrl}/issues` } : {}) } : {}) });
    }
    return reply(503, { ok: false, message: 'Připomínku se nepodařilo zpracovat. Text zůstává k dispozici.' });
  }
};
export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
