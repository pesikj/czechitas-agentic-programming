// Publishes the e2e content and signs in the seeded accounts once, saving their sessions.
import { expect, test as setup, type Page } from '@playwright/test';
import { SEED } from './seed';

setup.describe.configure({ mode: 'serial' });

async function signIn(page: Page, account: (typeof SEED)[keyof typeof SEED]) {
  await page.goto('/prihlaseni');
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Heslo', { exact: true }).fill(process.env[account.passwordEnv]!);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();
  await expect(page).toHaveURL('/');
}

setup('admin signs in and publishes the content', async ({ page }) => {
  await signIn(page, SEED.admin);
  await expect(page.getByRole('heading', { name: 'Materiály zatím nejsou k dispozici' })).toBeVisible();
  await page.goto('/admin/obsah');
  await page.getByRole('button', { name: 'Aktualizovat obsah' }).click();
  await expect(page.getByRole('status')).toContainText('Všichni studující nyní vidí novou verzi.');
  await page.context().storageState({ path: SEED.admin.state });
});

setup('learner signs in', async ({ page }) => {
  await signIn(page, SEED.learner);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agentní programování s Codex CLI a Claude Code');
  await page.context().storageState({ path: SEED.learner.state });
});
