// Enhances "Moje odpověď" forms: explicit saving with a status message, Psát/Náhled preview,
// and unsaved-change tracking. Text always stays in the editor when saving fails.
import { announce } from './announce';
import { registerEditor } from './unsaved';

for (const form of document.querySelectorAll<HTMLFormElement>('form.response-form')) setUp(form);

function setUp(form: HTMLFormElement): void {
  const textareas = [...form.querySelectorAll<HTMLTextAreaElement>('textarea')];
  const status = form.querySelector<HTMLElement>('.save-status')!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const switcher = form.querySelector<HTMLElement>('.mode-switch')!;
  let savedValues = textareas.map((textarea) => textarea.value);
  let saving: Promise<boolean> | undefined;

  const isDirty = () => textareas.some((textarea, index) => textarea.value !== savedValues[index]);

  const showStatus = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle('error', error);
  };

  const updateDirtyState = () => {
    if (saving) return;
    if (isDirty()) showStatus('Máte neuložené změny.');
  };
  for (const textarea of textareas) textarea.addEventListener('input', updateDirtyState);

  async function save(): Promise<boolean> {
    if (saving) return saving;
    saving = (async () => {
      const snapshot = textareas.map((textarea) => textarea.value);
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      showStatus('Ukládám…');
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; savedAtLabel?: string };
        if (!response.ok || !body.ok) {
          const reason = body.message ?? (response.status === 401 ? 'Byli jste odhlášeni. Přihlaste se v jiné záložce a zkuste to znovu.' : `Server odpověděl chybou ${response.status}.`);
          showStatus(`Neuloženo: ${reason} Text zůstal v editoru.`, true);
          announce('Odpověď se nepodařilo uložit');
          return false;
        }
        // Only what was sent counts as saved; later typing stays "unsaved".
        savedValues = snapshot;
        showStatus(isDirty() ? `Uloženo ${body.savedAtLabel}. Od té doby máte další změny.` : `Uloženo ${body.savedAtLabel}.`);
        announce('Odpověď je uložená');
        return true;
      } catch {
        showStatus('Neuloženo: spojení se serverem selhalo. Text zůstal v editoru, zkuste to znovu.', true);
        announce('Odpověď se nepodařilo uložit');
        return false;
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        saving = undefined;
      }
    })();
    return saving;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void save();
  });

  registerEditor({ isDirty, save });

  // Psát / Náhled: previews use the server's Markdown pipeline, identical to admin views.
  switcher.hidden = false;
  const modeButtons = [...switcher.querySelectorAll<HTMLButtonElement>('button[data-mode]')];
  const setMode = async (mode: 'write' | 'preview') => {
    for (const modeButton of modeButtons) modeButton.setAttribute('aria-pressed', String(modeButton.dataset.mode === mode));
    for (const textarea of textareas) {
      const preview = textarea.parentElement!.querySelector<HTMLElement>('.response-preview')!;
      textarea.hidden = mode === 'preview';
      preview.hidden = mode !== 'preview';
      if (mode !== 'preview') continue;
      preview.textContent = 'Načítám náhled…';
      try {
        const response = await fetch('/nahled-odpovedi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ markdown: textarea.value }),
          credentials: 'same-origin',
        });
        const { html } = (await response.json()) as { html: string };
        // Sanitized on the server by the same pipeline as course content.
        preview.innerHTML = textarea.value.trim() ? html : '<p><em>Pole je prázdné.</em></p>';
      } catch {
        preview.textContent = 'Náhled se nepodařilo načíst.';
      }
    }
    if (mode === 'write') textareas[0]?.focus();
  };
  for (const modeButton of modeButtons) {
    modeButton.addEventListener('click', () => void setMode(modeButton.dataset.mode === 'preview' ? 'preview' : 'write'));
  }
}
