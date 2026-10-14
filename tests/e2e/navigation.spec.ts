import { expect, test, type Page } from '@playwright/test';

const FIRST = '/lekce/uvod-do-agentu/co-je-agent';
const SECOND = '/lekce/uvod-do-agentu/instalace';

async function runCommand(page: Page, command: string) {
  const input = page.getByRole('combobox', { name: 'Příkaz pro navigaci webu' });
  await input.fill(command);
  await input.press('Enter');
}

test('home lists lectures from the repository and opens one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agentní programování s Codex CLI a Claude Code');
  await page.getByRole('main').getByRole('link', { name: 'Úvod do agentního programování' }).click();
  await expect(page).toHaveURL(FIRST);
  await expect(page.getByText('Část 1 z 4')).toBeVisible();
});

test('commands move forward, back and home', async ({ page }) => {
  await page.goto(FIRST);
  await runCommand(page, '/next');
  await expect(page).toHaveURL(SECOND);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Instalace nástrojů');
  await runCommand(page, '/back');
  await expect(page).toHaveURL(FIRST);
  await runCommand(page, '/domu');
  await expect(page).toHaveURL('/');
});

test('boundaries explain instead of wrapping', async ({ page }) => {
  await page.goto(FIRST);
  await runCommand(page, '/back');
  await expect(page.locator('#command-output')).toContainText('Jste na začátku lekce.');
  await expect(page).toHaveURL(FIRST);

  await page.goto('/lekce/uvod-do-agentu/cviceni-prvni-prompt');
  await runCommand(page, '/next');
  await expect(page.locator('#command-output')).toContainText('Toto je poslední část lekce.');
  await page.locator('#command-output').getByRole('link', { name: 'Další lekce: Práce s promptem' }).click();
  await expect(page).toHaveURL('/lekce/prace-s-promptem/iterace');
});

test('unknown and shell-like commands keep the current part', async ({ page }) => {
  await page.goto(SECOND);
  await runCommand(page, '/nxt');
  await expect(page.locator('#command-output')).toContainText('Neznámý příkaz „/nxt“.');
  await expect(page).toHaveURL(SECOND);
  await page.locator('#command-output').getByRole('button', { name: '/next' }).click();
  await expect(page).toHaveURL('/lekce/uvod-do-agentu/prvni-prompt');

  await runCommand(page, 'git status');
  await expect(page.locator('#command-output')).toContainText('ne terminál');
});

test('pager links do the same as commands', async ({ page }) => {
  await page.goto(FIRST);
  await page.getByRole('link', { name: /Další část/ }).click();
  await expect(page).toHaveURL(SECOND);
  await page.getByRole('link', { name: /Předchozí část/ }).click();
  await expect(page).toHaveURL(FIRST);
});

test('help explains commands and the browser back button', async ({ page }) => {
  await page.goto(FIRST);
  await runCommand(page, '/help');
  const help = page.locator('#command-help');
  await expect(help).toBeVisible();
  await expect(help).toContainText('Tlačítko Zpět v prohlížeči');
  await page.getByRole('combobox', { name: 'Příkaz pro navigaci webu' }).press('Escape');
  await expect(help).toBeHidden();
});

test('direct links, redirects and missing parts', async ({ page }) => {
  await page.goto('/lekce/uvod-do-agentu');
  await expect(page).toHaveURL(FIRST);

  const missing = await page.goto('/lekce/uvod-do-agentu/neexistuje');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tato část už neexistuje nebo byla přesunuta');
  await page.getByRole('link', { name: /Otevřít začátek lekce/ }).click();
  await expect(page).toHaveURL(FIRST);

  const unknown = await page.goto('/lekce/neexistuje/nic');
  expect(unknown?.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Zpět na přehled lekcí' })).toBeVisible();
});

test('the whole journey works with the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard journey is checked on desktop');
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Přeskočit na obsah' })).toBeFocused();
  await page.keyboard.press('/');
  const input = page.getByRole('combobox', { name: 'Příkaz pro navigaci webu' });
  await expect(input).toBeFocused();
  await page.keyboard.type('/home');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');

  await page.goto(FIRST);
  await page.keyboard.press('/');
  await page.keyboard.type('/ne');
  await expect(page.getByRole('option', { name: /\/next/ })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'command-option-0');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(SECOND);
});

test('"/" focuses the command bar on any keyboard layout, but shortcuts are left alone', async ({ page }) => {
  await page.goto(FIRST);
  // Czech layouts produce "/" with Shift, Option (macOS) or AltGr (Windows reports Ctrl+Alt).
  type Init = Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing', boolean>> & { code?: string };
  const focusesWith = (modifiers: Init) =>
    page.evaluate((init) => {
      (document.activeElement as HTMLElement | null)?.blur();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true, ...init }));
      return document.activeElement?.id === 'command-input';
    }, modifiers);

  expect(await focusesWith({})).toBe(true);
  expect(await focusesWith({ shiftKey: true })).toBe(true);
  expect(await focusesWith({ altKey: true })).toBe(true);
  expect(await focusesWith({ altKey: true, shiftKey: true })).toBe(true);
  expect(await focusesWith({ ctrlKey: true, altKey: true })).toBe(true);
  expect(await focusesWith({ code: 'NumpadDivide' })).toBe(true);
  expect(await focusesWith({ isComposing: true })).toBe(false);
  expect(await focusesWith({ metaKey: true })).toBe(false);
  expect(await focusesWith({ ctrlKey: true })).toBe(false);
});

test('typing "/" inside a text field does not jump to the command bar', async ({ page }) => {
  await page.goto(FIRST);
  // Milestone 6 adds response editors; a textarea stands in for one here.
  await page.evaluate(() => {
    const textarea = document.createElement('textarea');
    textarea.id = 'editor';
    document.querySelector('main')!.append(textarea);
  });
  const editor = page.locator('#editor');
  await editor.click();
  await page.keyboard.type('a/b');
  await page.keyboard.press('Enter');
  await expect(editor).toHaveValue('a/b\n');
  await expect(editor).toBeFocused();
  await expect(page).toHaveURL(FIRST);
});

test.describe('/open', () => {
  test('home shows lecture numbers and /open N opens a lecture', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lecture-list .number').first()).toHaveText('1');
    await runCommand(page, '/open 2');
    await expect(page).toHaveURL('/lekce/prace-s-promptem/iterace');
  });

  test('/open N.P opens a part, title words and the Czech alias work', async ({ page }) => {
    await page.goto('/');
    await runCommand(page, '/open 1.3');
    await expect(page).toHaveURL('/lekce/uvod-do-agentu/prvni-prompt');
    await runCommand(page, '/otevřít shrnutí');
    await expect(page).toHaveURL('/lekce/shrnuti/shrnuti-kurzu');
  });

  test('missing lecture explains and offers lectures', async ({ page }) => {
    await page.goto('/');
    await runCommand(page, '/open 9');
    await expect(page.locator('#command-output')).toContainText('Lekce 9 neexistuje. Kurz má 3 lekce.');
    await page.locator('#command-output').getByRole('button', { name: '3 Shrnutí' }).click();
    await expect(page).toHaveURL('/lekce/shrnuti/shrnuti-kurzu');
  });

  test('Tab completes /open and the keyboard picks a lecture from the list', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard completion is checked on desktop');
    await page.goto('/');
    await page.keyboard.press('/');
    await page.keyboard.type('/o');
    const input = page.getByRole('combobox', { name: 'Příkaz pro navigaci webu' });
    await page.keyboard.press('Tab');
    await expect(input).toHaveValue('/open ');
    await expect(page.getByRole('option')).toHaveCount(3);
    await expect(page.getByRole('option', { name: /Práce s promptem/ })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/lekce/prace-s-promptem/iterace');
  });

  test('typing "/open 1." lists the parts of lecture 1', async ({ page }) => {
    await page.goto('/');
    const input = page.getByRole('combobox', { name: 'Příkaz pro navigaci webu' });
    await input.fill('/open 1.');
    await expect(page.getByRole('option')).toHaveCount(4);
    await page.getByRole('option', { name: /Instalace nástrojů/ }).click();
    await expect(page).toHaveURL('/lekce/uvod-do-agentu/instalace');
  });

  test('the end of a lecture names the /open command for the next lecture', async ({ page }) => {
    await page.goto('/lekce/uvod-do-agentu/cviceni-prvni-prompt');
    await runCommand(page, '/next');
    await expect(page.locator('#command-output')).toContainText('příkazem /open 2');
  });
});
