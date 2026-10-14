// Unsaved answers: in-app navigation offers save / discard / stay. Skipping an untouched
// exercise never asks anything.

type Saver = () => Promise<boolean>;

interface Editor {
  isDirty: () => boolean;
  save: Saver;
}

const editors = new Set<Editor>();

export function registerEditor(editor: Editor): void {
  editors.add(editor);
}

function hasUnsavedChanges(): boolean {
  return [...editors].some((editor) => editor.isDirty());
}

let dialog: HTMLDialogElement | undefined;

function getDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'unsaved-dialog';
  dialog.setAttribute('aria-labelledby', 'unsaved-title');
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="unsaved-title">Neuložená odpověď</h2>
      <p>Máte rozepsanou odpověď, která ještě není uložená. Co s ní?</p>
      <div class="dialog-actions">
        <button value="save">Uložit a pokračovat</button>
        <button value="discard">Zahodit změny</button>
        <button value="stay" autofocus>Zůstat na stránce</button>
      </div>
    </form>`;
  document.body.append(dialog);
  return dialog;
}

function ask(): Promise<'save' | 'discard' | 'stay'> {
  const element = getDialog();
  return new Promise((resolve) => {
    element.addEventListener(
      'close',
      () => {
        const value = element.returnValue;
        resolve(value === 'save' || value === 'discard' ? value : 'stay');
      },
      { once: true },
    );
    element.returnValue = 'stay';
    element.showModal();
  });
}

let leaving = false;

/** Runs `proceed` if there is nothing unsaved, or after the learner chooses save/discard. */
async function guardNavigation(proceed: () => void): Promise<void> {
  if (!hasUnsavedChanges()) {
    proceed();
    return;
  }
  const choice = await ask();
  if (choice === 'stay') return;
  if (choice === 'save') {
    for (const editor of editors) {
      if (editor.isDirty() && !(await editor.save())) return; // the editor shows why; stay
    }
  }
  leaving = true;
  proceed();
}

/** Navigation used by the command bar, honouring unsaved answers. */
export function navigate(href: string): Promise<void> {
  return guardNavigation(() => location.assign(href));
}

// Links within the site.
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
  if (!link || link.target || link.hasAttribute('download') || !hasUnsavedChanges()) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // in-page anchor
  event.preventDefault();
  void guardNavigation(() => location.assign(url.href));
});

// Other forms (sign-out, search) leave the page too.
document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  if (event.defaultPrevented || form.classList.contains('response-form') || form.method === 'dialog') return;
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  void guardNavigation(() => form.submit());
});

// Reloading or closing the tab: the browser's own prompt.
addEventListener('beforeunload', (event) => {
  if (!leaving && hasUnsavedChanges()) event.preventDefault();
});
