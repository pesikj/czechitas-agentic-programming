import { expect, test, type Page } from '@playwright/test';
import { SEED } from './seed';
import { createActiveUser, signedInContext } from './users';

const EXERCISE = '/lekce/uvod-do-agentu/cviceni-prvni-prompt';
const panel = (page: Page) => page.getByRole('region', { name: 'Moje odpověď' });
const field = (page: Page, label: string) => panel(page).getByLabel(label);

test.describe('exercise responses', () => {
  test.skip(({ isMobile }) => isMobile, 'the editor flows are covered on desktop; layout is checked separately');

  test('write, preview, save explicitly, and reopen after signing in again', async ({ browser }) => {
    const learner = await createActiveUser('answers');
    const context = await signedInContext(browser, learner);
    const page = await context.newPage();
    await page.goto(EXERCISE);
    await expect(panel(page)).toContainText('Uloženou odpověď uvidí administrátoři kurzu.');
    await expect(panel(page).getByRole('status')).toHaveText('Zatím neuloženo.');

    // Enter inserts a newline in the editor and never runs a command.
    await field(page, 'Použitý prompt').click();
    await page.keyboard.type('Přidej patičku.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('**Druhý** pokus');
    await expect(field(page, 'Použitý prompt')).toHaveValue('Přidej patičku.\n**Druhý** pokus');
    await expect(page).toHaveURL(EXERCISE);

    await panel(page).getByRole('button', { name: 'Náhled' }).click();
    await expect(panel(page).locator('.response-preview strong').first()).toHaveText('Druhý');
    await panel(page).getByRole('button', { name: 'Psát' }).click();

    await panel(page).getByRole('button', { name: 'Uložit odpověď' }).click();
    await expect(panel(page).getByRole('status')).toContainText('Uloženo');

    await context.close();
    const again = await (await signedInContext(browser, learner)).newPage();
    await again.goto(EXERCISE);
    await expect(field(again, 'Použitý prompt')).toHaveValue('Přidej patičku.\n**Druhý** pokus');
    await expect(panel(again).getByRole('status')).toContainText('Uloženo');
  });

  test('a failed save keeps the text and can be retried', async ({ browser }) => {
    const page = await (await signedInContext(browser, await createActiveUser('failed-save'))).newPage();
    await page.goto(EXERCISE);
    await field(page, 'Reflexe').fill('Důležitá myšlenka');
    await page.route('**/odpovedi/**', (route) => route.abort());
    await panel(page).getByRole('button', { name: 'Uložit odpověď' }).click();
    await expect(panel(page).getByRole('status')).toContainText('Neuloženo');
    await expect(panel(page).getByRole('status')).not.toContainText('Uloženo ');
    await expect(field(page, 'Reflexe')).toHaveValue('Důležitá myšlenka');

    await page.unroute('**/odpovedi/**');
    await panel(page).getByRole('button', { name: 'Uložit odpověď' }).click();
    await expect(panel(page).getByRole('status')).toContainText('Uloženo');
  });

  test('unsaved edits offer save, discard or stay; untouched exercises never block', async ({ browser }) => {
    const page = await (await signedInContext(browser, await createActiveUser('unsaved'))).newPage();
    await page.goto(EXERCISE);
    // Untouched: navigation is not interrupted.
    await page.getByRole('link', { name: /Předchozí část/ }).click();
    await expect(page).toHaveURL('/lekce/uvod-do-agentu/prvni-prompt');
    await page.goBack();

    await field(page, 'Reflexe').fill('Rozepsáno');
    await page.getByRole('link', { name: /Předchozí část/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Neuložená odpověď' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Zůstat na stránce' }).click();
    await expect(page).toHaveURL(EXERCISE);
    await expect(field(page, 'Reflexe')).toHaveValue('Rozepsáno');

    // The command bar goes through the same check.
    const input = page.getByRole('combobox', { name: 'Příkaz pro navigaci webu' });
    await input.fill('/back');
    await input.press('Enter');
    await dialog.getByRole('button', { name: 'Uložit a pokračovat' }).click();
    await expect(page).toHaveURL('/lekce/uvod-do-agentu/prvni-prompt');
    await page.goto(EXERCISE);
    await expect(field(page, 'Reflexe')).toHaveValue('Rozepsáno');

    await field(page, 'Reflexe').fill('Zahodit tohle');
    await page.getByRole('link', { name: /Předchozí část/ }).click();
    await dialog.getByRole('button', { name: 'Zahodit změny' }).click();
    await expect(page).toHaveURL('/lekce/uvod-do-agentu/prvni-prompt');
    await page.goto(EXERCISE);
    await expect(field(page, 'Reflexe')).toHaveValue('Rozepsáno');
  });

  test('my answers page, Markdown export, and admin reading; learners see only their own', async ({ browser }) => {
    const author = await createActiveUser('author');
    const other = await createActiveUser('other');
    const authorPage = await (await signedInContext(browser, author)).newPage();
    await authorPage.goto(EXERCISE);
    await field(authorPage, 'Použitý prompt').fill('Tajný **prompt** autorky');
    await panel(authorPage).getByRole('button', { name: 'Uložit odpověď' }).click();
    await expect(panel(authorPage).getByRole('status')).toContainText('Uloženo');

    await authorPage.getByRole('link', { name: 'Moje odpovědi' }).click();
    await expect(authorPage.locator('.answer-card strong')).toHaveText('prompt');
    const download = await authorPage.request.get('/moje-odpovedi/export.md');
    expect(download.headers()['content-type']).toContain('text/markdown');
    const markdown = await download.text();
    expect(markdown).toContain('### Použitý prompt');
    expect(markdown).toContain('Tajný **prompt** autorky');

    const otherPage = await (await signedInContext(browser, other)).newPage();
    await otherPage.goto('/moje-odpovedi');
    await expect(otherPage.getByText('Zatím nemáte uloženou žádnou odpověď.')).toBeVisible();
    expect(await (await otherPage.request.get('/moje-odpovedi/export.md')).text()).not.toContain('Tajný');
    expect((await otherPage.request.get(`/admin/odpovedi/export.md?uzivatel=${author.id}`)).status()).toBe(403);
    await otherPage.goto(EXERCISE);
    await expect(field(otherPage, 'Použitý prompt')).toHaveValue('');

    const admin = await (await browser.newContext({ storageState: SEED.admin.state })).newPage();
    await admin.goto(`/admin/odpovedi?uzivatel=${author.id}`);
    await expect(admin.getByRole('heading', { name: new RegExp(author.email) })).toBeVisible();
    await expect(admin.locator('.answer-card strong')).toHaveText('prompt');
    const adminExport = await admin.request.get(`/admin/odpovedi/export.md?uzivatel=${author.id}`);
    expect(await adminExport.text()).toContain('Tajný **prompt** autorky');
  });

  test('answers are grouped by course for the learner and filterable by course for admins', async ({ browser }) => {
    const author = await createActiveUser('two-courses');
    const page = await (await signedInContext(browser, author)).newPage();
    for (const [url, label, text] of [
      [EXERCISE, 'Použitý prompt', 'Odpověď hlavního kurzu'],
      ['/data/lekce/grafy/prvni-graf', 'Postup', 'Odpověď datového kurzu'],
    ] as const) {
      await page.goto(url);
      await field(page, label).fill(text);
      await panel(page).getByRole('button', { name: 'Uložit odpověď' }).click();
      await expect(panel(page).getByRole('status')).toContainText('Uloženo');
    }

    await page.goto('/moje-odpovedi');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Agentní programování s Codex CLI a Claude Code', 'Digitální akademie: Data']);
    await expect(page.locator('.answer-card h3')).toHaveText(['Váš první prompt', 'Váš první graf']);

    const admin = await (await browser.newContext({ storageState: SEED.admin.state })).newPage();
    await admin.goto(`/admin/odpovedi?uzivatel=${author.id}`);
    await expect(admin.locator('.answer-card')).toHaveCount(2);
    await admin.getByLabel('Kurz', { exact: true }).selectOption({ label: 'Digitální akademie: Data' });
    await admin.getByRole('button', { name: 'Filtrovat' }).click();
    await expect(admin.locator('.answer-card')).toHaveCount(1);
    await expect(admin.locator('.answer-card')).toContainText('Odpověď datového kurzu');
    const exported = await admin.request.get(`/admin/odpovedi/export.md?uzivatel=${author.id}&kurz=data`);
    const markdown = await exported.text();
    expect(markdown).toContain('Odpověď datového kurzu');
    expect(markdown).not.toContain('Odpověď hlavního kurzu');
    expect(markdown).toMatch(/^Digitální akademie: Data$/m);
    expect(markdown).not.toContain('Agentní programování s Codex CLI a Claude Code');
  });

  test('saving needs a session', async ({ browser }) => {
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const response = await anonymous.request.post('/odpovedi/prvni-prompt-reflexe', {
      form: { 'pole.prompt': 'x' },
      headers: { Origin: 'http://localhost:4400', Accept: 'application/json' },
    });
    expect(response.status()).toBe(401);
  });
});
