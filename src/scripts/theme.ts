import { writeSetting } from './storage';

const root = document.documentElement;
const button = document.querySelector<HTMLButtonElement>('.theme-toggle');

function sync(): void {
  button?.setAttribute('aria-pressed', String(root.getAttribute('data-webtui-theme') === 'dark'));
}

button?.addEventListener('click', () => {
  const dark = root.getAttribute('data-webtui-theme') !== 'dark';
  if (dark) root.setAttribute('data-webtui-theme', 'dark');
  else root.removeAttribute('data-webtui-theme');
  writeSetting('theme', dark ? 'dark' : 'light');
  sync();
});

sync();
