// Turns ::::alternatives blocks into accessible tabs. Without JavaScript all options are shown.
import { readSetting, writeSetting } from './storage';

const groups = [...document.querySelectorAll<HTMLElement>('.prose .alternatives')];
const keyOf = (labels: string[]) => `alternatives:${[...labels].sort().join('|')}`;

type Group = { key: string; select: (label: string) => void };
const registered: Group[] = [];

groups.forEach((group, groupIndex) => {
  const panels = [...group.querySelectorAll<HTMLElement>(':scope > .alternative')];
  const labels = panels.map((panel) => panel.dataset.label ?? '');
  if (panels.length < 2) return;

  const tablist = document.createElement('div');
  tablist.className = 'alt-tabs';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Varianta postupu');

  const tabs = panels.map((panel, index) => {
    const id = `alt-${groupIndex}-${index}`;
    panel.id = `${id}-panel`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `${id}-tab`);
    panel.tabIndex = 0;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = `${id}-tab`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.textContent = labels[index] ?? '';
    tablist.append(tab);
    return tab;
  });

  const key = keyOf(labels);
  const select = (label: string, focus = false) => {
    const chosen = Math.max(0, labels.indexOf(label));
    tabs.forEach((tab, index) => {
      const selected = index === chosen;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[index]!.hidden = !selected;
    });
    if (focus) tabs[chosen]?.focus();
  };
  const choose = (label: string, focus = false) => {
    writeSetting(key, label);
    // Keep the same choice in every block with the same options on this page.
    for (const other of registered) if (other.key === key) other.select(label);
    select(label, focus);
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => choose(labels[index]!));
    tab.addEventListener('keydown', (event) => {
      const moves: Record<string, number> = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      const target = moves[event.key];
      if (target === undefined) return;
      event.preventDefault();
      choose(labels[target]!, true);
    });
  });

  group.prepend(tablist);
  group.classList.add('tabs-ready');
  registered.push({ key, select });
  select(readSetting(key) ?? labels[0]!);
});
