// Fetching content from a private repository: a token from CONTENT_REPO_TOKEN, sent as an HTTP header.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkoutRevision, displayRepositoryUrl, PublishError } from '../src/server/content/repository';
import { createContentRepo } from './support/content-repo';

const TOKEN = 'github_pat_test_0123456789';
const AUTHORIZATION = `Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString('base64')}`;

/** A private git server: serves `root` with `git http-backend`, only with the right Authorization header. */
function privateGitServer(root: string): http.Server {
  return http.createServer((request, response) => {
    if (request.headers.authorization !== AUTHORIZATION) {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' }).end();
      return;
    }
    const url = new URL(request.url!, 'http://localhost');
    const backend = spawn('git', ['http-backend'], {
      env: {
        PATH: process.env.PATH,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search.slice(1),
        REQUEST_METHOD: request.method,
        CONTENT_TYPE: request.headers['content-type'] ?? '',
        GIT_PROTOCOL: String(request.headers['git-protocol'] ?? ''),
      },
    });
    request.pipe(backend.stdin);
    // CGI output: headers, a blank line, then the body.
    let head = Buffer.alloc(0);
    let started = false;
    backend.stdout.on('data', (chunk: Buffer) => {
      if (started) return void response.write(chunk);
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) return;
      const headers: Record<string, string> = {};
      let status = 200;
      for (const line of head.subarray(0, end).toString().split('\r\n')) {
        const [name, ...value] = line.split(':');
        if (name!.toLowerCase() === 'status') status = Number.parseInt(value.join(':'), 10);
        else headers[name!] = value.join(':').trim();
      }
      response.writeHead(status, headers);
      response.write(head.subarray(end + 4));
      started = true;
    });
    backend.stdout.on('end', () => response.end());
  });
}

describe('private content repository', () => {
  let root: string;
  let server: http.Server;
  let url: string;
  let sha: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'course-private-repo-'));
    sha = createContentRepo(path.join(root, 'content'), 'fixtures/content/minimal');
    server = privateGitServer(root);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/content/.git`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });

  it('fetches with the token', async () => {
    const checkout = await checkoutRevision({ url, branch: 'main', token: TOKEN });
    try {
      expect(checkout.sha).toBe(sha);
      expect(readFileSync(path.join(checkout.dir, 'course.yaml'), 'utf8')).toContain('Testovací kurz');
    } finally {
      await checkout.dispose();
    }
  });

  it('fails without the token, or with a wrong one, without revealing it', async () => {
    await expect(checkoutRevision({ url, branch: 'main' })).rejects.toThrow(PublishError);
    const wrong = 'github_pat_wrong_9876543210';
    const error = await checkoutRevision({ url, branch: 'main', token: wrong }).then(
      () => new Error('expected the fetch to fail'),
      (caught: unknown) => caught as Error,
    );
    expect(error).toBeInstanceOf(PublishError);
    expect(error.message).toMatch(/CONTENT_REPO_TOKEN/);
    expect(error.message).not.toContain(wrong);
    expect(error.message).not.toContain(Buffer.from(`x-access-token:${wrong}`).toString('base64'));
  });

  it('rejects a token for a repository that is not fetched over HTTP(S)', async () => {
    await expect(checkoutRevision({ url: path.join(root, 'content'), branch: 'main', token: TOKEN })).rejects.toThrow(
      /CONTENT_REPO_TOKEN/,
    );
  });
});

describe('displayRepositoryUrl', () => {
  it('hides credentials written into the URL', () => {
    expect(displayRepositoryUrl('https://x-access-token:secret@github.com/org/content.git')).toBe('https://github.com/org/content.git');
    expect(displayRepositoryUrl('https://github.com/org/content.git')).toBe('https://github.com/org/content.git');
    expect(displayRepositoryUrl('../content')).toBe('../content');
  });
});
