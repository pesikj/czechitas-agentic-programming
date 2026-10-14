import { expect, test } from '@playwright/test';
import { testAddress } from '../support/mailpit';
import { SEED } from './seed';
import { createActiveUser, signedInContext } from './users';

test.use({ storageState: SEED.admin.state });
test.skip(({ isMobile }) => isMobile, 'administration is checked on desktop');

test('bulk creation reports every address', async ({ page }) => {
  const a = testAddress('bulk-ui-a');
  const b = testAddress('bulk-ui-b');
  await page.goto('/admin/uzivatele');
  await page.getByLabel('E-maily').fill(`${a}, neplatny\n${b}\n${a}`);
  await page.getByRole('button', { name: 'Vytvořit a pozvat' }).click();
  const results = page.getByRole('region', { name: 'Výsledek vytvoření účtů' });
  await expect(results.getByRole('row', { name: new RegExp(a) }).first()).toContainText('vytvořen');
  await expect(results.getByRole('row', { name: /neplatny/ })).toContainText('neplatná adresa');
  await expect(results.getByRole('row', { name: new RegExp(a) }).nth(1)).toContainText('v seznamu vícekrát');
  await expect(page.getByRole('status')).toContainText('2 účty vytvořeny z 4');
  // Entries that need attention stay in the box for correction.
  await expect(page.getByLabel('E-maily')).toHaveValue(`neplatny\n${a}`);
});

test('search and filter the account list', async ({ page }) => {
  const user = await createActiveUser('filterable');
  await page.goto('/admin/uzivatele');
  await page.getByLabel('Hledat e-mail').fill(user.email);
  await page.getByRole('button', { name: 'Filtrovat' }).click();
  const list = page.getByRole('region', { name: 'Seznam účtů' });
  await expect(list.getByRole('row')).toHaveCount(2);
  await page.getByLabel('Stav').selectOption('pending');
  await page.getByRole('button', { name: 'Filtrovat' }).click();
  await expect(page.getByText('Filtru neodpovídá žádný účet.')).toBeVisible();
});

test('deactivation revokes access immediately; reactivation restores it', async ({ page, browser }) => {
  const learner = await createActiveUser('deactivate-ui');
  const learnerPage = await (await signedInContext(browser, learner)).newPage();
  await learnerPage.goto('/');
  await expect(learnerPage).toHaveURL('/');

  await page.goto('/admin/uzivatele');
  await page.getByLabel('Hledat e-mail').fill(learner.email);
  await page.getByRole('button', { name: 'Filtrovat' }).click();
  await page.getByRole('link', { name: learner.email }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Deaktivovat' }).click();
  await expect(page.getByRole('status')).toContainText('byl deaktivován');

  await learnerPage.goto('/hledat?q=agent');
  await expect(learnerPage).toHaveURL(/\/prihlaseni/);

  await page.getByRole('button', { name: 'Znovu aktivovat' }).click();
  await expect(page.getByRole('status')).toContainText('je znovu aktivní');
});

test('administrators cannot deactivate or delete themselves', async ({ page }) => {
  await page.goto('/admin/uzivatele');
  await page.getByRole('region', { name: 'Seznam účtů' }).getByRole('link', { name: SEED.admin.email }).click();
  await expect(page.getByRole('button', { name: 'Deaktivovat' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Smazání účtu' })).toHaveCount(0);
});

test('deletion requires typing the email and offers an export first', async ({ page }) => {
  const learner = await createActiveUser('delete-ui');
  await page.goto('/admin/uzivatele');
  await page.getByLabel('Hledat e-mail').fill(learner.email);
  await page.getByRole('button', { name: 'Filtrovat' }).click();
  await page.getByRole('link', { name: learner.email }).click();
  await page.getByLabel('Pro potvrzení opište e-mail účtu').fill('spatne@example.test');
  await page.getByRole('button', { name: 'Trvale smazat účet' }).click();
  await expect(page.getByRole('alert')).toContainText('opište přesně');
  await page.getByLabel('Pro potvrzení opište e-mail účtu').fill(learner.email);
  await page.getByRole('button', { name: 'Trvale smazat účet' }).click();
  await expect(page).toHaveURL(/\/admin\/uzivatele\?smazano=/);
  await expect(page.getByRole('status')).toContainText('trvale smazány');
});
