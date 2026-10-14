// Lectures marked `public: true` (the e2e fixture's "Shrnutí") are readable without an account.
import { expect, test } from '@playwright/test';
import { SIGNED_OUT } from './seed';

const PUBLIC_PART = '/lekce/shrnuti/shrnuti-kurzu';

test.use({ storageState: SIGNED_OUT });

test('visitors read a public lecture with its images, but see no other lectures', async ({ page }) => {
  const response = await page.goto(PUBLIC_PART);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['cache-control']).toBe('private, no-store');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shrnutí kurzu');

  const image = page.getByRole('img', { name: /Postup/ });
  await expect(image).toBeVisible();
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // Navigation lists only public lectures; search is for signed-in users.
  // (#course-nav: on phones the sidebar is hidden until opened.)
  const nav = page.locator('#course-nav');
  await expect(nav).toBeAttached();
  await expect(nav).toContainText('Shrnutí');
  await expect(nav).not.toContainText('Úvod do agentního programování');
  await expect(page.getByRole('search')).toHaveCount(0);

  // Exercises explain that saving needs an account instead of showing the form.
  await expect(page.getByRole('button', { name: 'Uložit odpověď' })).toHaveCount(0);
  await expect(page.locator('.exercise-panel').getByRole('link', { name: 'Přihlaste se' })).toHaveAttribute(
    'href',
    `/prihlaseni?next=${encodeURIComponent(PUBLIC_PART)}`,
  );
  await expect(page.locator('.user-menu').getByRole('link', { name: 'Přihlásit se' })).toBeVisible();
});

test('everything else still requires sign-in', async ({ request }) => {
  for (const path of ['/lekce/uvod-do-agentu/co-je-agent', '/lekce/neexistuje', '/hledat?q=agent']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(303);
  }
  expect((await request.get('/obsah/lectures/01-uvod/images/pracovni-postup.png', { maxRedirects: 0 })).status()).toBe(401);
  expect((await request.get('/obsah/lectures/03-shrnuti/images/postup.png', { maxRedirects: 0 })).status()).toBe(200);
  expect((await request.post('/odpovedi/shrnuti-reflexe', { maxRedirects: 0, form: { 'pole.poznatek': 'x' } })).status()).not.toBe(200);
});

test('the title page lists only public lectures to visitors', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['cache-control']).toBe('private, no-store');
  await expect(page).toHaveURL('/');
  const lectures = page.getByRole('region', { name: 'Lekce' });
  await expect(lectures.getByRole('link')).toHaveText(['Shrnutí']);
  await page.locator('main').getByRole('link', { name: 'Přihlaste se' }).click();
  await expect(page).toHaveURL('/prihlaseni');
});

test('the sign-in page links to public lectures', async ({ page }) => {
  await page.goto('/prihlaseni');
  await page.getByRole('region', { name: 'Bez přihlášení' }).getByRole('link', { name: 'Shrnutí' }).click();
  await expect(page).toHaveURL(PUBLIC_PART);
});
