import { quoteSelection, selectedMaterialText } from '../lib/content-report';

const dialog = document.querySelector<HTMLDialogElement>('#content-report');
const trigger = document.querySelector<HTMLButtonElement>('#content-report-trigger');
const material = document.querySelector<HTMLElement>('article.part > .prose');
if (dialog && trigger && material) initialize(dialog, trigger, material);

function initialize(dialog: HTMLDialogElement, trigger: HTMLButtonElement, material: HTMLElement): void {
  const form = dialog.querySelector('form')!;
  const editor = form.querySelector('textarea')!;
  const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const cancel = form.querySelector<HTMLButtonElement>('[data-report-cancel]')!;
  const message = form.querySelector<HTMLElement>('.content-report-message')!;
  const links = form.querySelector<HTMLElement>('.content-report-links')!;
  let state: 'editing' | 'pending' | 'success' | 'error' = 'editing';
  let captured: string | undefined;
  const capture = () => { captured = selectedMaterialText(window.getSelection(), material); };
  trigger.addEventListener('pointerdown', capture);
  trigger.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') capture(); });
  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    editor.value = quoteSelection(captured ?? selectedMaterialText(window.getSelection(), material));
    captured = undefined;
    editor.readOnly = false;
    editor.setCustomValidity('');
    state = 'editing';
    message.textContent = '';
    links.replaceChildren();
    submit.disabled = false;
    cancel.disabled = false;
    cancel.textContent = 'Zrušit';
    dialog.showModal();
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  });
  const close = () => {
    if (state === 'pending') return;
    if (state !== 'success' && editor.value.trim() && !window.confirm('Zahodit rozepsanou připomínku?')) return;
    editor.value = '';
    dialog.close();
  };
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => trigger.focus());
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('textarea, button:not(:disabled), a[href]')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  editor.addEventListener('input', () => editor.setCustomValidity(''));

  const appendLink = (url: unknown, label: string) => {
    if (typeof url !== 'string' || !/^https:\/\/github\.com\/[a-z\d-]+\/[a-z\d_.-]+\/issues(?:\/[1-9]\d*)?$/i.test(url)) return;
    const paragraph = document.createElement('p');
    const link = document.createElement('a');
    link.href = url;
    link.textContent = label;
    paragraph.append(link);
    links.append(paragraph);
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state === 'pending' || state === 'success') return;
    if (!editor.value.trim()) {
      editor.setCustomValidity('Vyplňte připomínku.');
      editor.reportValidity();
      return;
    }
    if (!form.reportValidity()) return;
    state = 'pending';
    submit.disabled = true;
    cancel.disabled = true;
    editor.readOnly = true;
    message.textContent = 'Odesílám připomínku…';
    links.replaceChildren();
    try {
      const response = await fetch('/admin/pripominky', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ courseId: form.dataset.courseId, lectureId: form.dataset.lectureId, partId: form.dataset.partId, revisionSha: form.dataset.revisionSha || null, body: editor.value }),
      });
      const result = await response.json();
      if (response.ok && result.ok === true && typeof result.issueUrl === 'string') {
        state = 'success';
        message.textContent = `Připomínka byla uložena na GitHub.${typeof result.assignmentWarning === 'string' ? ` ${result.assignmentWarning}` : ''}`;
        appendLink(result.issueUrl, 'Otevřít issue');
        cancel.textContent = 'Zavřít';
      } else {
        state = 'error';
        message.textContent = typeof result.message === 'string' ? result.message : 'Připomínku se nepodařilo odeslat. Text zůstává k dispozici.';
        if (result.ambiguous) appendLink(result.repositoryIssuesUrl, 'Zkontrolovat issues v repozitáři');
      }
    } catch {
      state = 'error';
      message.textContent = 'Výsledek odeslání není známý. GitHub mohl připomínku přijmout. Před dalším odesláním zkontrolujte issues v obsahovém repozitáři. Text zůstává k dispozici.';
      appendLink(dialog.dataset.repositoryIssuesUrl, 'Zkontrolovat issues v repozitáři');
    } finally {
      submit.disabled = state === 'success';
      cancel.disabled = false;
      editor.readOnly = state === 'success';
    }
  });

  // Account for the wrapping sticky command bar, including its open help/output.
  const bar = document.querySelector<HTMLElement>('.command-bar');
  const position = () => trigger.style.bottom = `${(bar?.getBoundingClientRect().height ?? 0) + 12}px`;
  if (bar) new ResizeObserver(position).observe(bar);
  position();
  trigger.hidden = false;
  const resizeViewport = () => dialog.style.setProperty('--report-viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
  window.visualViewport?.addEventListener('resize', resizeViewport);
  resizeViewport();
}
