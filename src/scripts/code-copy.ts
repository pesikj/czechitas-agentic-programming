// Copy buttons on code blocks. Copies only the code, never the label; output blocks and diagrams have none.
import { announce } from './announce';

for (const block of document.querySelectorAll<HTMLElement>('.prose .code-block:not([data-kind="output"], [data-kind="diagram"])')) {
  const code = block.querySelector('code');
  if (!code) continue;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-button';
  button.textContent = 'Kopírovat';
  const label = block.querySelector('.code-label')?.textContent;
  button.setAttribute('aria-label', label ? `Kopírovat: ${label}` : 'Kopírovat kód');
  button.addEventListener('click', async () => {
    const text = (code.textContent ?? '').replace(/\n$/, '');
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Zkopírováno';
      announce('Zkopírováno do schránky');
    } catch {
      // Fallback: select the code so the learner can copy it manually.
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection?.removeAllRanges();
      selection?.addRange(range);
      button.textContent = 'Označeno — zkopírujte Ctrl+C';
      announce('Kód je označený, zkopírujte ho klávesovou zkratkou');
    }
    setTimeout(() => (button.textContent = 'Kopírovat'), 2500);
  });
  block.append(button);
}
