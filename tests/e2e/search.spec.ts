import { expect, test } from '@playwright/test';

test('search finds parts across lectures and links to them', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    await page.goto('/hledat');
  } else {
    await page.getByRole('searchbox', { name: 'Hledat v materiálech' }).fill('TERMINAL');
    await page.getByRole('searchbox', { name: 'Hledat v materiálech' }).press('Enter');
  }
  if (isMobile) {
    await page.getByLabel('Hledaný výraz').fill('TERMINAL');
    await page.getByRole('button', { name: 'Hledat' }).click();
  }
  await expect(page).toHaveURL('/hledat?q=TERMINAL');
  await expect(page.getByRole('status')).toContainText('pro „TERMINAL“');
  await expect(page.locator('.search-results mark').first()).toHaveText(/termin[aá]l/i);
  await page.getByRole('link', { name: 'Instalace nástrojů' }).click();
  await expect(page).toHaveURL('/lekce/uvod-do-agentu/instalace');
});

test('the /search command and an empty result', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Příkaz pro navigaci webu' });
  await input.fill('/hledat neexistujicislovo');
  await input.press('Enter');
  await expect(page).toHaveURL('/hledat?q=neexistujicislovo');
  await expect(page.getByRole('status')).toContainText('neodpovídá žádná část');
});

test('search is not available signed out', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/hledat?q=prompt');
  await expect(page).toHaveURL(/\/prihlaseni\?next=/);
});
