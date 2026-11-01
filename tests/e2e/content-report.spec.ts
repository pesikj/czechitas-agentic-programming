import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { SEED, SIGNED_OUT } from './seed';

const lectureUrl = '/lekce/uvod-do-agentu/co-je-agent';
const trigger = (page: Page) => page.getByRole('button', { name: 'Přidat připomínku', exact: true });
const editor = (page: Page) => page.getByRole('textbox', { name: 'Připomínka' });
const save = (page: Page) => page.getByRole('button', { name: 'Uložit připomínku', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Připomínka k materiálům' });

test.describe('admin content review', () => {
  test.use({ storageState: SEED.admin.state });
  test('readiness is on each course home and reporting is only on in-progress lectures', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lecture-status')).toHaveText(['Rozpracováno', 'Připraveno', 'Stav neznámý']);
    await page.goto('/data/');
    await expect(page.locator('.lecture-status')).toHaveText(['Rozpracováno', 'Nezahájeno']);
    for (const url of ['/lekce/prace-s-promptem/iterace', '/lekce/shrnuti/shrnuti', '/data/lekce/grafy/grafy']) {
      await page.goto(url);
      await expect(trigger(page)).toHaveCount(0);
    }
    for (const url of [lectureUrl, '/data/lekce/tabulky/uvod-do-tabulek']) {
      await page.goto(url);
      await expect(trigger(page)).toBeVisible();
    }
  });
  test('captures selected material before focus moves, then creates one report', async ({ page }) => {
    let requests = 0;
    await page.route('**/admin/pripominky', async (route) => {
      requests++;
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ courseId: 'agent', lectureId: 'uvod-do-agentu', partId: 'co-je-agent' });
      expect(body.revisionSha).toMatch(/^[0-9a-f]{40}$/);
      expect(body.body).toContain('> Programovací agent');
      expect(body.body).toContain('> Typický pracovní postup');
      await route.fulfill({ status: 201, json: { ok: true, issueUrl: 'https://github.com/author/materials/issues/17', assignmentWarning: 'Issue bylo vytvořeno bez přiřazení.' } });
    });
    await page.goto(lectureUrl);
    await page.locator('article.part > .prose').evaluate((element) => {
      const paragraphs = element.querySelectorAll(':scope > p');
      const range = document.createRange(); range.setStart(paragraphs[0]!, 0); range.setEnd(paragraphs[1]!, paragraphs[1]!.childNodes.length);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    await trigger(page).click();
    await expect(editor(page)).toHaveValue(/^> Programovací agent/);
    await editor(page).fill(`${await editor(page).inputValue()}**Opravit příklad**`);
    await save(page).click();
    await expect(dialog(page).getByRole('link', { name: 'Otevřít issue' })).toHaveAttribute('href', 'https://github.com/author/materials/issues/17');
    await expect(dialog(page)).toContainText('bez přiřazení');
    await expect(save(page)).toBeDisabled();
    expect(requests).toBe(1);
  });
  test('ignores selections outside material and across exercise panels', async ({ page }) => {
    await page.goto('/lekce/uvod-do-agentu/cviceni-prvni-prompt');
    await page.locator('article.part > .prose').evaluate((root) => {
      const range = document.createRange(); range.selectNodeContents(root);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    await trigger(page).click(); await expect(editor(page)).toBeEmpty();
    await page.getByRole('button', { name: 'Zrušit', exact: true }).click();
    await page.locator('.brand').evaluate((root) => {
      const range = document.createRange(); range.selectNodeContents(root);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    await trigger(page).click(); await expect(editor(page)).toBeEmpty();
  });
  test('keeps pending and failed drafts and confirms discard', async ({ page }) => {
    let requests = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/admin/pripominky', async (route) => {
      requests++; await gate;
      await route.fulfill({ status: 503, json: { ok: false, ambiguous: true, message: 'GitHub mohl připomínku přijmout.', repositoryIssuesUrl: 'https://github.com/author/materials/issues' } });
    });
    await page.goto(lectureUrl); await trigger(page).click();
    await editor(page).fill('**Moje připomínka**'); await save(page).click();
    await expect(save(page)).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(dialog(page)).toBeVisible();
    release();
    await expect(dialog(page)).toContainText('GitHub mohl');
    await expect(editor(page)).toHaveValue('**Moje připomínka**');
    await expect(dialog(page).getByRole('link', { name: 'Zkontrolovat issues v repozitáři' })).toHaveAttribute('href', /\/issues$/);
    page.once('dialog', (confirmation) => confirmation.dismiss());
    await page.getByRole('button', { name: 'Zrušit', exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    page.once('dialog', (confirmation) => confirmation.accept());
    await page.getByRole('button', { name: 'Zrušit', exact: true }).click();
    await expect(dialog(page)).toBeHidden(); await expect(trigger(page)).toBeFocused();
    expect(requests).toBe(1);
  });
  for (const status of [409, 503]) {
    test(`retains draft on ${status} error`, async ({ page }) => {
      await page.route('**/admin/pripominky', (route) => route.fulfill({ status, json: { ok: false, message: 'Odeslání se nezdařilo.' } }));
      await page.goto(lectureUrl); await trigger(page).click();
      await editor(page).fill('Oprava'); await save(page).click();
      await expect(dialog(page)).toContainText('Odeslání se nezdařilo.');
      await expect(editor(page)).toHaveValue('Oprava'); await expect(save(page)).toBeEnabled();
    });
  }
  test('checking an ambiguous issue opens a new tab and preserves the draft', async ({ page, context }) => {
    await context.route('https://github.com/author/materials/issues', (route) => route.fulfill({ body: '<h1>Issues</h1>', contentType: 'text/html' }));
    await page.route('**/admin/pripominky', (route) => route.fulfill({ status: 503, json: { ok: false, ambiguous: true, message: 'GitHub mohl připomínku přijmout.', repositoryIssuesUrl: 'https://github.com/author/materials/issues' } }));
    await page.goto(lectureUrl); await trigger(page).click();
    await editor(page).fill('Připomínka, kterou nechci ztratit'); await save(page).click();
    const recovery = dialog(page).getByRole('link', { name: 'Zkontrolovat issues v repozitáři' });
    await expect(recovery).toHaveAttribute('target', '_blank');
    await expect(recovery).toHaveAttribute('rel', /noopener/);
    const popupPromise = page.waitForEvent('popup'); await recovery.click();
    const popup = await popupPromise; await popup.waitForLoadState();
    await expect(page).toHaveURL(new RegExp(`${lectureUrl}$`));
    await expect(editor(page)).toHaveValue('Připomínka, kterou nechci ztratit');
    await expect(dialog(page)).toBeVisible();
    await popup.close();
  });
  test('lost browser response provides the server-configured recovery link without retrying', async ({ page }) => {
    let requests = 0;
    await page.route('**/admin/pripominky', (route) => { requests++; return route.abort(); });
    await page.goto(lectureUrl);
    // The e2e publisher uses a local git fixture. Supply the server-rendered GitHub identity
    // that a deployed content repository would provide, without changing its publishing source.
    await page.locator('#content-report').evaluate((element) => { (element as HTMLElement).dataset.repositoryIssuesUrl = 'https://github.com/author/materials/issues'; });
    await trigger(page).click(); await editor(page).fill('Draft after lost response'); await save(page).click();
    const recovery = dialog(page).getByRole('link', { name: 'Zkontrolovat issues v repozitáři' });
    await expect(recovery).toHaveAttribute('href', 'https://github.com/author/materials/issues');
    await expect(recovery).toHaveAttribute('target', '_blank');
    await expect(editor(page)).toHaveValue('Draft after lost response');
    await expect(dialog(page)).toContainText('Výsledek odeslání není známý');
    expect(requests).toBe(1);
  });
  test('rejects whitespace before sending', async ({ page }) => {
    let requests = 0;
    await page.route('**/admin/pripominky', (route) => { requests++; return route.abort(); });
    await page.goto(lectureUrl); await trigger(page).click();
    await editor(page).fill('   '); await save(page).click();
    expect(await editor(page).evaluate((element: HTMLTextAreaElement) => element.validationMessage)).toBe('Vyplňte připomínku.');
    expect(requests).toBe(0);
  });
  test('is keyboard accessible and remains above the command bar while scrolling', async ({ page }) => {
    await page.goto(lectureUrl);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const button = await trigger(page).boundingBox(); const bar = await page.locator('.command-bar').boundingBox();
    expect(button!.y + button!.height).toBeLessThanOrEqual(bar!.y);
    await trigger(page).focus(); await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await expect(editor(page)).toBeEmpty();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog(page).getByRole('button', { name: 'Zrušit', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(editor(page)).toBeFocused();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape'); await expect(trigger(page)).toBeFocused();
  });
});

for (const [role, storageState] of [['learner', SEED.learner.state], ['visitor', SIGNED_OUT]] as const) {
  test.describe(role, () => {
    test.use({ storageState });
    test('does not see readiness or reporting controls', async ({ page }) => {
      await page.goto('/data/'); await expect(page.locator('.lecture-status')).toHaveCount(0);
      await page.goto('/data/lekce/tabulky/uvod-do-tabulek'); await expect(trigger(page)).toHaveCount(0);
      const response = await page.request.post('/admin/pripominky', { data: {}, headers: { Origin: 'http://localhost:4400' } });
      expect(response.status()).toBe(role === 'learner' ? 403 : 401);
    });
  });
}
