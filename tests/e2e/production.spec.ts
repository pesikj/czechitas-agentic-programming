import { expect, test } from '@playwright/test';
import { SEED, SIGNED_OUT } from './seed';

const PROD = 'http://127.0.0.1:4401';
test.use({ storageState: SIGNED_OUT });

// The production build serves course content only to signed-in users (apart from public lectures).
test('production build: signed-out requests get sign-in or 401, never content', async ({ request }) => {
  for (const path of ['/lekce/uvod-do-agentu/co-je-agent', '/admin/uzivatele']) {
    const response = await request.get(`${PROD}${path}`, { maxRedirects: 0 });
    expect(response.status(), path).toBe(303);
    expect(response.headers().location, path).toMatch(/^\/prihlaseni/);
  }
  const image = await request.get(`${PROD}/obsah/lectures/01-uvod/images/pracovni-postup.png`, { maxRedirects: 0 });
  expect(image.status()).toBe(401);
  expect(image.headers()['content-type']).not.toMatch(/image/);

  // The title page is public but names only public lectures.
  const home = await request.get(`${PROD}/`, { maxRedirects: 0 });
  expect(home.status()).toBe(200);
  const html = await home.text();
  expect(html).toContain('Shrnutí');
  expect(html).not.toContain('Úvod do agentního programování');

  const signIn = await request.get(`${PROD}/prihlaseni`);
  expect(signIn.status()).toBe(200);
  expect(signIn.headers()['x-frame-options']).toBe('DENY');
});

test('production build: CSP is set and pages work under it', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });

  const response = await page.goto(`${PROD}/prihlaseni`);
  const csp = response?.headers()['content-security-policy'];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src[^;]*'sha256-/);

  await page.getByLabel('E-mail').fill(SEED.learner.email);
  await page.getByLabel('Heslo', { exact: true }).fill(process.env[SEED.learner.passwordEnv]!);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();
  await expect(page).toHaveURL(`${PROD}/`);

  await page.goto(`${PROD}/lekce/uvod-do-agentu/instalace`);
  // Bundled scripts run: alternatives become tabs and the command bar navigates.
  await expect(page.getByRole('tab', { name: 'Windows' })).toBeVisible();
  const input = page.getByRole('combobox', { name: 'Příkaz pro navigaci webu' });
  await input.fill('/next');
  await input.press('Enter');
  await expect(page).toHaveURL(`${PROD}/lekce/uvod-do-agentu/prvni-prompt`);
  // The inline theme script runs before paint.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-webtui-theme', 'dark');
  expect(violations).toEqual([]);
});
