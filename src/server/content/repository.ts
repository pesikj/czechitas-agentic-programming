// Git access to the content repository. Each run fetches into a temporary directory that is
// removed afterwards; nothing from the repository is kept on disk (prepared content is stored
// in the database, see snapshot-store.ts).
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getConfig } from '../config';

const run = promisify(execFile);

export interface RepositorySettings {
  url: string;
  branch: string;
  /** Access token for a private repository fetched over HTTPS (e.g. a GitHub token). */
  token?: string;
}

export function repositorySettings(): RepositorySettings {
  const config = getConfig();
  return {
    url: config.CONTENT_REPO_URL,
    branch: config.CONTENT_BRANCH,
    ...(config.CONTENT_REPO_TOKEN ? { token: config.CONTENT_REPO_TOKEN } : {}),
  };
}

/** The repository URL for display, without any credentials written into it. */
export function displayRepositoryUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1');
}

/** Prefix of the temporary checkout directories (under the system temp directory). */
export const CHECKOUT_PREFIX = 'course-content-';

/** A problem the administrator can act on; the message is shown in Czech. */
export class PublishError extends Error {}

// Never prompt for credentials (the server has no terminal); fail instead.
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'true', LC_ALL: 'C' };

async function git(args: string[], env: Record<string, string> = {}): Promise<string> {
  const { stdout } = await run('git', args, { env: { ...GIT_ENV, ...env }, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

const authorization = (token: string) => `Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;

/**
 * Git configuration that sends the token as an HTTP header for the repository's host only. It is
 * passed in the environment, so it never appears in the URL, command arguments or git's messages
 * (the same approach as GitHub's actions/checkout).
 */
function authEnv(settings: RepositorySettings): Record<string, string> {
  if (!settings.token) return {};
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `http.${new URL(settings.url).origin}/.extraheader`,
    GIT_CONFIG_VALUE_0: `Authorization: ${authorization(settings.token)}`,
  };
}

/** Removes credentials from git's output before it is shown or stored. */
function redact(text: string, settings: RepositorySettings): string {
  let clean = displayRepositoryUrl(text).replace(/(\/\/)[^/@\s'"]*@/g, '$1');
  if (settings.token) clean = clean.replaceAll(settings.token, '***').replaceAll(authorization(settings.token), '***');
  return clean;
}

function validate(settings: RepositorySettings): void {
  if (settings.url.startsWith('-')) throw new PublishError('Adresa obsahového repozitáře (CONTENT_REPO_URL) je neplatná.');
  if (settings.token && !/^https?:\/\//i.test(settings.url)) {
    throw new PublishError('Token (CONTENT_REPO_TOKEN) funguje jen s adresou repozitáře https://… (CONTENT_REPO_URL).');
  }
  if (!/^[\w][\w./-]*$/.test(settings.branch) || settings.branch.includes('..')) {
    throw new PublishError(`Název větve „${settings.branch}“ (CONTENT_BRANCH) je neplatný.`);
  }
}

export interface Checkout {
  sha: string;
  /** The commit's files. */
  dir: string;
  /** Removes the temporary directory. */
  dispose(): Promise<void>;
}

/**
 * Fetches the configured branch (or, with `sha`, that commit of it, e.g. to rebuild a published
 * revision) and extracts its files into a temporary directory.
 */
export async function checkoutRevision(settings: RepositorySettings, sha?: string): Promise<Checkout> {
  validate(settings);
  if (sha !== undefined && !/^[0-9a-f]{40,64}$/.test(sha)) throw new PublishError(`Neplatná revize „${sha}“.`);
  const temporary = await mkdtemp(path.join(os.tmpdir(), CHECKOUT_PREFIX));
  const dispose = () => rm(temporary, { recursive: true, force: true });
  try {
    const mirror = path.join(temporary, 'repo.git');
    await git(['init', '--bare', '--quiet', mirror]);
    const commit = await fetchCommit(mirror, settings, sha);
    const dir = path.join(temporary, 'files');
    await mkdir(dir);
    try {
      await pipeArchive(mirror, commit, dir);
    } catch (error) {
      throw new PublishError(`Revizi ${commit.slice(0, 7)} se nepodařilo rozbalit. (${String(error)})`);
    }
    return { sha: commit, dir, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

async function fetchCommit(mirror: string, settings: RepositorySettings, sha: string | undefined): Promise<string> {
  const ref = `refs/remotes/content/${settings.branch}`;
  try {
    await git(
      ['--git-dir', mirror, 'fetch', '--quiet', '--force', '--no-tags', '--', settings.url, `+refs/heads/${settings.branch}:${ref}`],
      authEnv(settings),
    );
  } catch (error) {
    const detail = redact((error as { stderr?: string }).stderr?.trim().split('\n').at(-1) ?? String(error), settings);
    if (/couldn't find remote ref/i.test(detail)) {
      throw new PublishError(
        `Větev „${settings.branch}“ v obsahovém repozitáři neexistuje nebo nemá žádný commit. (${detail})`,
      );
    }
    if (/authentication failed|could not read username|repository not found|\b40[13]\b/i.test(detail)) {
      throw new PublishError(
        `Přístup k obsahovému repozitáři byl odmítnut. U soukromého repozitáře zkontrolujte token v CONTENT_REPO_TOKEN (platnost a oprávnění ke čtení obsahu) a adresu v CONTENT_REPO_URL. (${detail})`,
      );
    }
    throw new PublishError(`Obsahový repozitář se nepodařilo stáhnout. Zkontrolujte adresu a přístup. (${detail})`);
  }
  if (!sha) return git(['--git-dir', mirror, 'rev-parse', `${ref}^{commit}`]);
  if (!(await isCommit(mirror, sha))) {
    // No longer on the branch (e.g. after a force push): ask for the commit itself.
    await git(['--git-dir', mirror, 'fetch', '--quiet', '--no-tags', '--', settings.url, sha], authEnv(settings)).catch(() => undefined);
    if (!(await isCommit(mirror, sha))) throw new PublishError(`Revize ${sha.slice(0, 7)} v obsahovém repozitáři není.`);
  }
  return sha;
}

const isCommit = async (mirror: string, sha: string) =>
  (await git(['--git-dir', mirror, 'cat-file', '-t', sha]).catch(() => '')) === 'commit';

/** `git archive <sha> | tar -x -C <dir>` without a shell. */
function pipeArchive(mirror: string, sha: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = spawn('git', ['--git-dir', mirror, 'archive', '--format=tar', sha], { env: GIT_ENV });
    const extract = spawn('tar', ['-x', '-f', '-', '-C', destination]);
    let stderr = '';
    archive.stderr.on('data', (chunk) => (stderr += chunk));
    extract.stderr.on('data', (chunk) => (stderr += chunk));
    archive.stdout.pipe(extract.stdin);
    let pending = 2;
    let failed = false;
    const done = (code: number | null) => {
      if (code !== 0 && !failed) {
        failed = true;
        reject(new Error(stderr.trim() || `exit code ${code}`));
      }
      if (--pending === 0 && !failed) resolve();
    };
    archive.on('error', reject);
    extract.on('error', reject);
    archive.on('close', done);
    extract.on('close', done);
  });
}
