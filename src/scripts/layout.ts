// Mobile navigation drawer and content enhancements.
import './alternatives';
import './code-copy';
import './diagrams';
import './image-dialog';
import './forms';
import './responses';

const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
const sidebar = document.querySelector<HTMLElement>('#course-nav');
const closeButton = sidebar?.querySelector<HTMLButtonElement>('.sidebar-close');
const outside = ['main', '.command-bar', '.topbar'].map((selector) => document.querySelector<HTMLElement>(selector));

function setOpen(open: boolean): void {
  if (!toggle || !sidebar) return;
  sidebar.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', String(open));
  // Keep keyboard focus inside the drawer while it is open.
  for (const element of outside) {
    if (element) element.inert = open;
  }
  if (open) {
    (sidebar.querySelector<HTMLElement>('[aria-current="page"]') ?? closeButton)?.focus();
  } else {
    toggle.focus();
  }
}

toggle?.addEventListener('click', () => setOpen(!sidebar?.classList.contains('open')));
closeButton?.addEventListener('click', () => setOpen(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sidebar?.classList.contains('open')) setOpen(false);
});
// Close the drawer when the layout switches to desktop width.
matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
  if (event.matches && sidebar?.classList.contains('open')) setOpen(false);
});
