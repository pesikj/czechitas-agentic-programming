// Runs last (own project): changes the published course content.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { commitAll } from '../support/content-repo';
import { E2E_CONTENT_REPO, SEED } from './seed';

test.describe.configure({ mode: 'serial' });

const file = (relative: string) => path.join(E2E_CONTENT_REPO, relative);
const PART = '/lekce/shrnuti/shrnuti-kurzu';

test('repository edits stay invisible until an administrator updates the content', async ({ page, browser }) => {
  writeFileSync(file('lectures/03-shrnuti/shrnuti.md'), readFileSync(file('lectures/03-shrnuti/shrnuti.md'), 'utf8').replace('title: Shrnutí kurzu', 'title: Shrnutí po úpravě'));
  commitAll(E2E_CONTENT_REPO, 'Edit summary title');

  const learner = await (await browser.newContext({ storageState: SEED.learner.state })).newPage();
  await learner.goto(PART);
  await expect(learner.getByRole('heading', { level: 1 })).toHaveText('Shrnutí kurzu');

  await page.goto('/admin/obsah');
  await page.getByRole('button', { name: 'Aktualizovat obsah' }).click();
  await expect(page.getByRole('status')).toContainText('Zveřejněna revize');

  await learner.reload();
  await expect(learner.getByRole('heading', { level: 1 })).toHaveText('Shrnutí po úpravě');
});

test('an invalid revision is rejected with details and the current content stays', async ({ page, browser }) => {
  renameSync(file('course.yaml'), file('kurz.yaml'));
  commitAll(E2E_CONTENT_REPO, 'Break course.yaml');

  await page.goto('/admin/obsah');
  await page.getByRole('button', { name: 'Aktualizovat obsah' }).click();
  await expect(page.getByRole('alert')).toContainText('Aktualizace se nezdařila');
  await expect(page.getByRole('alert')).toContainText('Studující dál vidí revizi');
  await expect(page.locator('.issues')).toContainText('course-missing');

  const learner = await (await browser.newContext({ storageState: SEED.learner.state })).newPage();
  await learner.goto(PART);
  await expect(learner.getByRole('heading', { level: 1 })).toHaveText('Shrnutí po úpravě');

  renameSync(file('kurz.yaml'), file('course.yaml'));
  commitAll(E2E_CONTENT_REPO, 'Fix course.yaml');
});

test('learners cannot trigger an update', async ({ browser }) => {
  const learner = await (await browser.newContext({ storageState: SEED.learner.state })).newPage();
  const response = await learner.request.post('/admin/obsah', { headers: { Origin: 'http://localhost:4400' } });
  expect(response.status()).toBe(403);
});
