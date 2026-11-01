import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../src/lib/content';
import { GithubIssueError } from '../src/server/content/github-issues';

const mocks = vi.hoisted(() => ({ config: { APP_BASE_URL: 'https://course.test', CONTENT_REPO_URL: 'https://github.com/author/materials', CONTENT_REPO_TOKEN: 'test-token' }, content: vi.fn(), create: vi.fn() }));
vi.mock('../src/server/config', () => ({ getConfig: () => mocks.config }));
vi.mock('../src/server/content/provider', () => ({ getContent: mocks.content }));
vi.mock('../src/server/content/github-issues', async (original) => ({ ...await original<typeof import('../src/server/content/github-issues')>(), createContentIssue: mocks.create }));
import { POST } from '../src/pages/admin/pripominky';

const sha = 'a'.repeat(40);
const catalog = (await loadContent('fixtures/content/courses')).model!;
const input = { courseId: 'agent', lectureId: 'zaklady', partId: 'uvod', revisionSha: sha, body: '> selected\n\n**Correction**' };
let userId = 0;
function call(body: unknown = input, options: { role?: string; anonymous?: boolean; origin?: string | null; raw?: string; headers?: Record<string, string>; method?: string; id?: string } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.origin === null ? {} : { Origin: options.origin ?? 'https://course.test' }), ...options.headers };
  const request = new Request('https://course.test/admin/pripominky', { method: options.method ?? 'POST', headers, body: options.raw ?? JSON.stringify(body) });
  return POST({ request, locals: { user: options.anonymous ? undefined : { id: options.id ?? `user-${++userId}`, role: options.role ?? 'admin', email: 'reporter@example.test' } } } as unknown as Parameters<typeof POST>[0]);
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const course of catalog.courses) for (const lecture of course.lectures) lecture.status = 'in-progress';
  mocks.content.mockResolvedValue({ state: 'ready', model: catalog, revision: { id: 'rev-id', sha } });
  mocks.create.mockResolvedValue({ url: 'https://github.com/author/materials/issues/17', number: 17 });
  mocks.config.CONTENT_REPO_TOKEN = 'test-token';
  mocks.config.CONTENT_REPO_URL = 'https://github.com/author/materials';
});

describe('report submission boundary', () => {
  it.each([[{ anonymous: true }, 401], [{ role: 'learner' }, 403], [{ origin: null }, 403], [{ origin: 'https://evil.test' }, 403]] as const)('rejects unauthorized requests %j', async (options, expected) => {
    expect((await call(input, options)).status).toBe(expected);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([{ ...input, body: '   ' }, { ...input, email: 'forged@example.test' }, { ...input, repository: 'evil/repo' }, { ...input, body: 'x'.repeat(20_001) }])('rejects invalid input', async (value) => {
    expect((await call(value)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and unsupported media types', async () => {
    expect((await call(input, { raw: '{' })).status).toBe(400);
    expect((await call(input, { headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
  });
  it('bounds actual bytes even without content length', async () => {
    expect((await call(input, { raw: 'x'.repeat(32769) })).status).toBe(413);
    expect((await call(input, { headers: { 'Content-Length': '32769' } })).status).toBe(413);
  });
  it('limits one admin to five attempts per minute', async () => {
    for (let i = 0; i < 5; i++) expect((await call(input, { id: 'rate-limited-admin' })).status).toBe(201);
    expect((await call(input, { id: 'rate-limited-admin' })).status).toBe(429);
  });
  it.each([{ courseId: 'missing' }, { lectureId: 'missing' }, { partId: 'missing' }, { courseId: 'data' }])('rejects missing or mismatched identity %j', async (change) => {
    expect((await call({ ...input, ...change })).status).toBe(404);
  });
  it.each(['ready', 'not-started', 'unknown', undefined])('rejects status %s', async (status) => {
    Object.assign(catalog.courses[0]!.lectures[0]!, { status });
    expect((await call()).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(['b'.repeat(40), null])('rejects stale revisions %s', async (revisionSha) => {
    expect((await call({ ...input, revisionSha })).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('creates an issue with trusted metadata and unchanged Markdown', async () => {
    const response = await call();
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ ok: true, issueUrl: 'https://github.com/author/materials/issues/17' });
    const submitted = mocks.create.mock.calls[0]![0];
    expect(submitted.title).toBe('[Content] Základy práce s agentem / Úvod');
    for (const text of ['reporter@example.test', input.body, 'https://course.test/lekce/zaklady/uvod', 'lectures/01-zaklady/01-uvod.md', sha, 'https://github.com/author/materials/blob/']) expect(submitted.body).toContain(text);
  });
  it('resolves additional course routes and preview context', async () => {
    mocks.content.mockResolvedValue({ state: 'ready', model: catalog });
    expect((await call({ ...input, courseId: 'data', lectureId: 'tabulky', partId: 'uvod', revisionSha: null })).status).toBe(201);
    const body = mocks.create.mock.calls[0]![0].body;
    expect(body).toContain('https://course.test/data/lekce/tabulky/uvod');
    expect(body).toContain('Náhled');
    expect(body).not.toContain('/blob/');
  });
  it('returns success with a separate assignment warning', async () => {
    mocks.create.mockResolvedValue({ url: 'https://github.com/author/materials/issues/17', number: 17, assignmentWarning: 'Unassigned' });
    expect(await (await call()).json()).toMatchObject({ ok: true, assignmentWarning: 'Unassigned' });
  });
  it.each(['token', 'repository'])('fails recoverably for missing %s configuration', async (which) => {
    if (which === 'token') mocks.config.CONTENT_REPO_TOKEN = '';
    else mocks.config.CONTENT_REPO_URL = '../local';
    expect((await call()).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('reports uncertain creation without retrying', async () => {
    mocks.create.mockRejectedValue(new GithubIssueError('ambiguous'));
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, ambiguous: true, repositoryIssuesUrl: 'https://github.com/author/materials/issues' });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
