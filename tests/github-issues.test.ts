import { describe, expect, it } from 'vitest';
import { createContentIssue, parseGithubRepository } from '../src/server/content/github-issues';

const repository = { owner: 'author', repo: 'materials', htmlUrl: 'https://github.com/author/materials' };
const input = { repository, token: 'secret-test-token', title: 'Content issue', body: '**Correction**' };
const issue = { number: 17, html_url: `${repository.htmlUrl}/issues/17`, assignees: [{ login: 'author' }] };
function fakeApi(options: { organization?: boolean; eligibility?: number; omitAssignment?: boolean; post?: Response | Error; metadataStatus?: number } = {}) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (init?.method === 'POST') {
      if (options.post instanceof Error) throw options.post;
      return options.post ?? Response.json({ ...issue, assignees: options.omitAssignment ? [] : [{ login: options.organization ? 'pesikj' : 'author' }] }, { status: 201 });
    }
    if (String(url).includes('/assignees/')) return new Response(null, { status: options.eligibility ?? 204 });
    return Response.json({ owner: { login: 'author', type: options.organization ? 'Organization' : 'User' }, has_issues: true }, { status: options.metadataStatus ?? 200 });
  }) as typeof fetch;
  return { requests, fetcher };
}

describe('GitHub repository identity', () => {
  it.each(['https://github.com/author/materials.git', 'git@github.com:author/materials.git', 'ssh://git@github.com/author/materials.git'])('accepts %s', (url) => {
    expect(parseGithubRepository(url)).toEqual(repository);
  });
  it.each(['../content', 'https://github.com.evil.test/author/materials', 'https://evil.test/author/materials', 'https://token@github.com/author/materials', 'https://github.com/author/materials?x=1', 'https://github.com/author/materials#main', 'https://github.com/author/materials/tree/main', 'https://github.com/../materials', 'http://github.com/author/materials'])('rejects %s', (url) => {
    expect(parseGithubRepository(url)).toBeUndefined();
  });
});

describe('GitHub content issues', () => {
  it.each([false, true])('assigns personal owner or organization fallback (%s)', async (organization) => {
    const api = fakeApi({ organization });
    expect(await createContentIssue(input, api.fetcher)).toEqual({ url: issue.html_url, number: 17 });
    const post = api.requests.find((request) => request.init?.method === 'POST')!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ title: input.title, body: input.body, assignees: [organization ? 'pesikj' : 'author'] });
    expect(api.requests.every((r) => r.url.startsWith('https://api.github.com/repos/author/materials') && r.init?.redirect === 'error')).toBe(true);
  });
  it.each([{ eligibility: 404, omitAssignment: true }, { omitAssignment: true }])('keeps the issue when assignment is unavailable: %j', async (options) => {
    const api = fakeApi(options);
    expect(await createContentIssue(input, api.fetcher)).toMatchObject({ url: issue.html_url, number: 17, assignmentWarning: expect.any(String) });
    expect(api.requests.filter((r) => r.init?.method === 'POST')).toHaveLength(1);
    if ('eligibility' in options) expect(JSON.parse(api.requests.at(-1)!.init!.body as string).assignees).toEqual([]);
  });
  it.each([{ metadataStatus: 403 }, { eligibility: 403 }, { metadataStatus: 302 }])('does not create when prerequisites fail: %j', async (options) => {
    const api = fakeApi(options);
    await expect(createContentIssue(input, api.fetcher)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(api.requests.some((r) => r.init?.method === 'POST')).toBe(false);
  });
  it('does not retry ambiguous creation or expose API details', async () => {
    const api = fakeApi({ post: new Error('secret-test-token') });
    await expect(createContentIssue(input, api.fetcher)).rejects.toMatchObject({ kind: 'ambiguous', message: expect.not.stringContaining('secret-test-token') });
    expect(api.requests.filter((r) => r.init?.method === 'POST')).toHaveLength(1);
  });
  it('reports a definite API rejection safely', async () => {
    const api = fakeApi({ post: Response.json({ message: 'secret-test-token' }, { status: 422 }) });
    await expect(createContentIssue(input, api.fetcher)).rejects.toMatchObject({ kind: 'unavailable', message: expect.not.stringContaining('secret-test-token') });
  });
  it.each([
    { ...issue, html_url: 'https://evil.test/issue' },
    { ...issue, number: undefined },
  ])('treats malformed success as ambiguous', async (payload) => {
    const api = fakeApi({ post: Response.json(payload, { status: 201 }) });
    await expect(createContentIssue(input, api.fetcher)).rejects.toMatchObject({ kind: 'ambiguous' });
  });
});
