// Command bar: website navigation only. Enter runs a command only while focus is in this input.
import { navigate } from './unsaved';
import { completions, runCommand, type CommandContext, type CommandResult, type Suggestion } from '../lib/commands';

const bar = document.querySelector<HTMLElement>('.command-bar');
if (bar) setUp(bar);

function setUp(bar: HTMLElement): void {
  const context = JSON.parse(bar.dataset.context ?? '{"page":"other"}') as CommandContext;
  const form = bar.querySelector('form')!;
  const input = bar.querySelector<HTMLInputElement>('#command-input')!;
  const list = bar.querySelector<HTMLUListElement>('#command-suggestions')!;
  const output = bar.querySelector<HTMLElement>('#command-output')!;
  const help = bar.querySelector<HTMLElement>('#command-help')!;
  let options: string[] = [];
  let active = -1;

  const execute = (text: string) => {
    closeList();
    show(runCommand(text, context), text);
  };

  /** A completion ending with a space (e.g. "/open ") needs an argument: fill it in and keep suggesting. */
  const choose = (value: string) => {
    if (!value.endsWith(' ')) {
      execute(value);
      return;
    }
    input.value = value;
    input.focus();
    active = -1;
    renderList();
  };

  function show(result: CommandResult, text: string): void {
    output.replaceChildren();
    if (result.kind === 'navigate') {
      input.value = '';
      void navigate(result.href);
      return;
    }
    if (result.kind === 'help') {
      help.hidden = false;
      input.value = '';
      output.append(paragraph('Nápověda je zobrazená níže. Zavřete ji klávesou Escape.'));
      return;
    }
    help.hidden = true;
    output.append(paragraph(result.text));
    if (result.suggestions.length > 0) output.append(suggestionList(result.suggestions));
    input.value = text.trim();
    input.select();
  }

  function paragraph(text: string): HTMLElement {
    const element = document.createElement('p');
    element.className = 'message';
    element.textContent = text;
    return element;
  }

  function suggestionList(suggestions: Suggestion[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'suggestions';
    for (const suggestion of suggestions) {
      if (suggestion.href) {
        const link = document.createElement('a');
        link.href = suggestion.href;
        link.textContent = suggestion.label;
        container.append(link);
      } else if (suggestion.command) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = suggestion.label;
        const command = suggestion.command;
        button.addEventListener('click', () => execute(command));
        container.append(button);
      }
    }
    return container;
  }

  function renderList(): void {
    const matches = completions(input.value, context);
    options = matches.map((completion) => completion.value);
    if (options.length === 0 || (options.length === 1 && options[0] === input.value.trim())) {
      closeList();
      return;
    }
    active = Math.min(active, options.length - 1);
    list.replaceChildren(
      ...matches.map((completion, index) => {
        const item = document.createElement('li');
        item.id = `command-option-${index}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(index === active));
        const name = document.createElement('code');
        name.textContent = completion.label;
        const description = document.createElement('span');
        description.className = 'description';
        description.textContent = completion.description;
        item.append(name, description);
        // mousedown keeps focus in the input; click runs the command.
        item.addEventListener('mousedown', (event) => event.preventDefault());
        item.addEventListener('click', () => choose(completion.value));
        return item;
      }),
    );
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `command-option-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function closeList(): void {
    list.hidden = true;
    list.replaceChildren();
    options = [];
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  input.addEventListener('input', () => {
    active = -1;
    renderList();
  });

  input.addEventListener('keydown', (event) => {
    const open = !list.hidden && options.length > 0;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) renderList();
      if (options.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + options.length) % options.length;
      renderList();
    } else if (event.key === 'Tab' && open && !event.shiftKey) {
      const choice = options[Math.max(active, 0)]!;
      if (choice !== input.value) {
        event.preventDefault();
        input.value = choice;
        active = -1;
        renderList();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (open) closeList();
      else if (!help.hidden || output.childElementCount > 0) {
        help.hidden = true;
        output.replaceChildren();
      } else if (input.value) input.value = '';
      else document.querySelector<HTMLElement>('main')?.focus();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const choice = active >= 0 ? options[active] : undefined;
    if (choice) choose(choice);
    else execute(input.value);
  });

  input.addEventListener('blur', () => setTimeout(closeList, 100));

  // "/" focuses the command bar, but never while the learner is typing elsewhere.
  // Works on every keyboard layout: it reacts to the character produced ("/"), not to a physical
  // key. Layouts type it with Shift, Option (macOS), AltGr (Windows reports Ctrl+Alt) or the
  // numeric keypad, so only real shortcuts are skipped (Cmd, or Ctrl without Alt).
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.defaultPrevented || event.isComposing) return;
    const altGraph = event.getModifierState('AltGraph') || (event.ctrlKey && event.altKey);
    if (event.metaKey || (event.ctrlKey && !altGraph)) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    input.focus();
  });
}
