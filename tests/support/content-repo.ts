// Temporary git repositories with fixture content, for publishing tests.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const git = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** Creates (or recreates) a repository at `dir` whose `main` branch holds the fixture. */
export function createContentRepo(dir: string, fixture: string): string {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '--quiet', '--initial-branch=main');
  cpSync(fixture, dir, { recursive: true });
  return commitAll(dir, 'Initial content');
}

/** Commits every change in the working tree and returns the new commit SHA. */
export function commitAll(dir: string, message: string): string {
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '--allow-empty', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}
