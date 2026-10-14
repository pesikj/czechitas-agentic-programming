import { expect, test, type Browser, type Page } from '@playwright/test';
import { latestEmailTo, otpFrom, resetLinkFrom, testAddress } from '../support/mailpit';
import { SEED, SIGNED_OUT } from './seed';

const PART = '/lekce/uvod-do-agentu/instalace';
const NEW_PASSWORD = 'zelený kopec za řekou';

test.use({ storageState: SIGNED_OUT });

/** Creates a learner through the admin screen and returns the emailed one-time password. */
async function inviteLearner(browser: Browser, label: string) {
  const email = testAddress(label);
  const context = await browser.newContext({ storageState: SEED.admin.state });
  const admin = await context.newPage();
  await admin.goto('/admin/uzivatele');
  await admin.getByLabel('E-maily').fill(email);
  await admin.getByRole('button', { name: 'Vytvořit a pozvat' }).click();
  const results = admin.getByRole('region', { name: 'Výsledek vytvoření účtů' });
  await expect(results.getByRole('row', { name: new RegExp(email) })).toContainText('vytvořen');
  await expect(results.getByRole('row', { name: new RegExp(email) })).toContainText('předána k odeslání');
  await expect(admin.getByRole('region', { name: 'Seznam účtů' }).getByRole('row', { name: new RegExp(email) })).toContainText('čeká na aktivaci');
  await context.close();
  return { email, otp: otpFrom((await latestEmailTo(email)).text)! };
}

async function signIn(page: Page, email: string, secret: string) {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();
}

async function setPassword(page: Page, password: string) {
  await page.getByLabel('Nové heslo', { exact: true }).fill(password);
  await page.getByLabel('Nové heslo znovu').fill(password);
  await page.getByRole('button', { name: 'Uložit heslo' }).click();
}

test('signed-out visitors are sent to sign-in and never get content or images', async ({ page, request }) => {
  await page.goto(PART);
  await expect(page).toHaveURL(`/prihlaseni?next=${encodeURIComponent(PART)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Přihlášení');

  const image = await request.get('/obsah/lectures/01-uvod/images/pracovni-postup.png', { maxRedirects: 0 });
  expect(image.status()).toBe(401);
  expect(image.headers()['content-type']).not.toMatch(/image/);
});

test('invitation → one-time password → required password change → requested part', async ({ page, browser }) => {
  const { email, otp } = await inviteLearner(browser, 'journey');

  await page.goto(PART);
  await signIn(page, email, otp);
  await expect(page).toHaveURL(`/zmena-hesla?next=${encodeURIComponent(PART)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nastavte si heslo');

  // Content stays locked until the password is set.
  await page.goto('/');
  await expect(page).toHaveURL(/\/zmena-hesla/);
  await page.goto(`/zmena-hesla?next=${encodeURIComponent(PART)}`);

  await setPassword(page, 'kratke');
  await expect(page.getByRole('alert')).toContainText('Heslo musí mít alespoň 10 znaků.');
  await setPassword(page, NEW_PASSWORD);
  await expect(page).toHaveURL(PART);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Instalace nástrojů');

  // The one-time password no longer works; the new password does.
  await page.getByRole('button', { name: 'Odhlásit' }).click();
  await expect(page).toHaveURL('/prihlaseni?odhlaseno=1');
  await signIn(page, email, otp);
  await expect(page.getByRole('alert')).toHaveText('Nesprávný e-mail nebo heslo.');
  await signIn(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL('/');
});

test('sign-out ends access, also via the back button', async ({ page, browser }) => {
  const { email, otp } = await inviteLearner(browser, 'signout');
  await page.goto('/prihlaseni');
  await signIn(page, email, otp);
  await setPassword(page, NEW_PASSWORD);
  await page.goto(PART);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Instalace nástrojů');

  await page.getByRole('button', { name: 'Odhlásit' }).click();
  await expect(page).toHaveURL('/prihlaseni?odhlaseno=1');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Instalace nástrojů');
  await page.goto(PART);
  await expect(page).toHaveURL(/\/prihlaseni/);
});

test('resending an invitation replaces the one-time password', async ({ page, browser }) => {
  const { email, otp: first } = await inviteLearner(browser, 'resend');
  const context = await browser.newContext({ storageState: SEED.admin.state });
  const admin = await context.newPage();
  await admin.goto('/admin/uzivatele');
  await admin.getByRole('link', { name: email }).click();
  const resentAt = new Date();
  admin.once('dialog', (dialog) => dialog.accept());
  await admin.getByRole('button', { name: 'Znovu odeslat pozvánku' }).click();
  await expect(admin.getByRole('status')).toContainText('Předchozí jednorázové heslo už neplatí.');
  await context.close();
  const second = otpFrom((await latestEmailTo(email, { after: resentAt })).text)!;

  await page.goto('/prihlaseni');
  await signIn(page, email, first);
  await expect(page.getByRole('alert')).toHaveText('Nesprávný e-mail nebo heslo.');
  await signIn(page, email, second);
  await expect(page).toHaveURL(/\/zmena-hesla/);
});

test('forgotten password: single-use link, neutral confirmation', async ({ page, browser }) => {
  const { email, otp } = await inviteLearner(browser, 'recovery');
  await page.goto('/prihlaseni');
  await signIn(page, email, otp);
  await setPassword(page, NEW_PASSWORD);
  await page.getByRole('button', { name: 'Odhlásit' }).click();

  // An unknown address gets exactly the same confirmation.
  await page.getByRole('link', { name: 'Zapomenuté heslo' }).click();
  await page.getByLabel('E-mail').fill(testAddress('nobody'));
  await page.getByRole('button', { name: 'Poslat odkaz' }).click();
  const neutral = await page.getByRole('status').textContent();

  await page.goto('/zapomenute-heslo');
  const requestedAt = new Date();
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Poslat odkaz' }).click();
  expect(await page.getByRole('status').textContent()).toBe(neutral);

  const link = new URL(resetLinkFrom((await latestEmailTo(email, { after: requestedAt })).text)!);
  await page.goto(link.pathname);
  await setPassword(page, 'modrá loďka na jezeře');
  await expect(page).toHaveURL('/prihlaseni?heslo-obnoveno=1');
  await signIn(page, email, 'modrá loďka na jezeře');
  await expect(page).toHaveURL('/');

  const reused = await page.goto(link.pathname);
  expect(reused?.status()).toBe(410);
  await expect(page.getByRole('status')).toContainText('Odkaz pro obnovení hesla už neplatí.');
  expect(reused?.headers()['referrer-policy']).toBe('same-origin');
});

test('learners cannot use administration', async ({ browser }) => {
  const context = await browser.newContext({ storageState: SEED.learner.state });
  const page = await context.newPage();
  const response = await page.goto('/admin/uzivatele');
  expect(response?.status()).toBe(403);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Přístup odepřen');
  await expect(page.getByRole('link', { name: 'Administrace' })).toHaveCount(0);

  const post = await page.request.post('/admin/uzivatele', {
    form: { action: 'create', email: testAddress('sneaky'), role: 'admin' },
    headers: { Origin: 'http://localhost:4400' },
  });
  expect(post.status()).toBe(403);
  await context.close();
});

test('cross-site form posts are rejected', async ({ request }) => {
  const response = await request.post('/prihlaseni', {
    form: { email: SEED.learner.email, password: 'x' },
    headers: { Origin: 'https://evil.example' },
  });
  expect(response.status()).toBe(403);
});
