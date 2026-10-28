import { expect, test } from '@playwright/test';

test('images enlarge in a dialog and return focus', async ({ page }) => {
  await page.goto('/lekce/uvod-do-agentu/co-je-agent');
  const trigger = page.getByRole('link', { name: /Zvětšit obrázek: Schéma/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Zvětšený obrázek' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toHaveAttribute('alt', /Schéma/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('missing images show a fallback while the part still loads', async ({ page }) => {
  await page.goto('/lekce/prace-s-promptem/iterace');
  await expect(page.locator('.image-missing')).toContainText('Obrázek není k dispozici');
  await expect(page.getByRole('heading', { name: 'Oddíl 8' })).toBeAttached();
});

test('code blocks are labelled; output has no copy button', async ({ page, context, browserName }) => {
  await page.goto('/lekce/uvod-do-agentu/instalace');
  const terminal = page.locator('.code-block[data-kind="terminal"]').first();
  await expect(terminal.locator('.code-label')).toHaveText('Terminál');
  await expect(page.locator('.code-block[data-kind="output"] .copy-button')).toHaveCount(0);

  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await terminal.getByRole('button', { name: /Kopírovat/ }).click();
  await expect(terminal.getByRole('button')).toHaveText('Zkopírováno');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('node --version');
});

test('mermaid diagrams are drawn, follow the theme and keep their source', async ({ page }) => {
  const blocked: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) blocked.push(message.text());
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/lekce/prace-s-promptem/iterace');
  const diagram = page.locator('.code-block[data-kind="diagram"]');
  // Drawn only when it comes near the viewport. The fixture diagram is at the end of a long page, so
  // the many tests that only pass through this page do not load Mermaid (CPU-heavy in parallel runs).
  await expect(diagram.getByRole('img')).toHaveCount(0);
  await diagram.scrollIntoViewIfNeeded();
  const image = diagram.getByRole('img', { name: 'Diagram: Postup iterace' });
  await expect(image).toBeVisible();
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const light = (await image.getAttribute('src'))!;
  const text = await image.evaluate((img: HTMLImageElement) => {
    const svg = decodeURIComponent(img.src.slice(img.src.indexOf(',') + 1));
    return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement.textContent;
  });
  expect(text).toContain('Upřesnit prompt');

  // The source stays available, collapsed under the drawing.
  await expect(diagram.locator('code')).toBeHidden();
  await diagram.getByText('Zdrojový kód diagramu').click();
  await expect(diagram.locator('code')).toContainText('flowchart LR');

  await page.getByRole('button', { name: 'Tmavý režim' }).click();
  await expect(image).not.toHaveAttribute('src', light);
  expect(blocked).toEqual([]);
});

test('alternatives become tabs and remember the choice', async ({ page }) => {
  await page.goto('/lekce/uvod-do-agentu/instalace');
  const windows = page.getByRole('tab', { name: 'Windows' });
  await windows.click();
  await expect(windows).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('PowerShell');
  await windows.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Linux' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Linux' })).toHaveAttribute('aria-selected', 'true');
});

test('exercise panel shows fields without blocking navigation', async ({ page }) => {
  await page.goto('/lekce/uvod-do-agentu/cviceni-prvni-prompt');
  const panel = page.getByRole('region', { name: 'Moje odpověď' });
  await expect(panel).toContainText('Použitý prompt');
  await expect(panel).toContainText('Odpověď je nepovinná');
  await page.getByRole('link', { name: /Předchozí část/ }).click();
  await expect(page).toHaveURL('/lekce/uvod-do-agentu/prvni-prompt');
});

test('only referenced assets are served', async ({ request }) => {
  expect((await request.get('/obsah/lectures/01-uvod/images/pracovni-postup.png')).status()).toBe(200);
  expect((await request.get('/obsah/course.yaml')).status()).toBe(404);
  expect((await request.get('/obsah/lectures/01-uvod/lecture.yaml')).status()).toBe(404);
  expect((await request.get('/obsah/..%2F..%2Fpackage.json')).status()).toBe(404);
});

test('theme toggle persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Tmavý režim' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-webtui-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-webtui-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Tmavý režim' })).toHaveAttribute('aria-pressed', 'true');
});
