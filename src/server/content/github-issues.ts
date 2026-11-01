// GitHub is the only report store. Never retry a creation request automatically.
import { z } from 'zod';

export interface GithubRepository { owner: string; repo: string; htmlUrl: string }
export interface CreatedContentIssue { url: string; number: number; assignmentWarning?: string }
export class GithubIssueError extends Error {
  constructor(public readonly kind: 'configuration' | 'unavailable' | 'ambiguous') {
    super(kind === 'configuration'
      ? 'Hlášení není nastaveno. Zkontrolujte obsahový repozitář a token GitHubu.'
      : kind === 'ambiguous'
        ? 'GitHub mohl připomínku přijmout. Před dalším odesláním zkontrolujte seznam issues v repozitáři.'
        : 'Připomínku se nepodařilo odeslat na GitHub. Zkontrolujte přístup k repozitáři a zkuste to později.');
  }
}

export function parseGithubRepository(url: string): GithubRepository | undefined {
  // Strict patterns deliberately avoid URL normalization (e.g. /a/../b) and credential URLs.
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z\d](?:[a-z\d-]*[a-z\d])?)\/([a-z\d_.-]+?)\/?$/i.exec(url);
  if (!match) return undefined;
  const owner = match[1]!;
  const repo = match[2]!.replace(/\.git$/, '');
  if (!repo || repo === '.' || repo === '..') return undefined;
  return { owner, repo, htmlUrl: `https://github.com/${owner}/${repo}` };
}

const metadataSchema = z.object({ owner: z.object({ login: z.string().regex(/^[a-z\d-]+$/i), type: z.enum(['User', 'Organization']) }), has_issues: z.boolean() });
const issueSchema = z.object({ number: z.number().int().positive(), html_url: z.string(), assignees: z.array(z.object({ login: z.string() })) });

export async function createContentIssue(
  input: { repository: GithubRepository; token: string; title: string; body: string },
  fetcher: typeof fetch = fetch,
): Promise<CreatedContentIssue> {
  const { repository, token } = input;
  if (!token || !parseGithubRepository(repository.htmlUrl)) throw new GithubIssueError('configuration');
  const base = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
  const request = async (suffix: string, body?: object): Promise<Response> => {
    try {
      return await fetcher(`${base}${suffix}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new GithubIssueError(body ? 'ambiguous' : 'unavailable'); }
  };
  const metadataResponse = await request('');
  if (!metadataResponse.ok) throw new GithubIssueError('unavailable');
  const metadata = await metadataResponse.json().then((value: unknown) => metadataSchema.safeParse(value)).catch(() => undefined);
  if (!metadata?.success || !metadata.data.has_issues) throw new GithubIssueError('unavailable');
  const candidate = metadata.data.owner.type === 'User' ? metadata.data.owner.login : 'pesikj';
  const eligibility = await request(`/assignees/${encodeURIComponent(candidate)}`);
  if (eligibility.status !== 204 && eligibility.status !== 404) throw new GithubIssueError('unavailable');
  const assignees = eligibility.status === 204 ? [candidate] : [];
  const response = await request('/issues', { title: input.title, body: input.body, assignees });
  // Server failures can occur after a write. Explicit client rejections are definite failures.
  if (!response.ok) throw new GithubIssueError(response.status >= 500 ? 'ambiguous' : 'unavailable');
  const parsed = await response.json().then((value: unknown) => issueSchema.safeParse(value)).catch(() => undefined);
  if (!parsed?.success) throw new GithubIssueError('ambiguous');
  const issue = parsed.data;
  const url = `${repository.htmlUrl}/issues/${issue.number}`;
  if (issue.html_url.toLowerCase() !== url.toLowerCase()) throw new GithubIssueError('ambiguous');
  const assigned = issue.assignees.some((user) => user.login.toLowerCase() === candidate.toLowerCase());
  return { url, number: issue.number, ...(!assigned ? { assignmentWarning: `Issue bylo vytvořeno, ale nepodařilo se jej přiřadit uživateli ${candidate}.` } : {}) };
}
