let region: HTMLElement | undefined;

/** Announces a short status message to screen readers. */
export function announce(message: string): void {
  if (!region) {
    region = document.createElement('div');
    region.className = 'visually-hidden';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  region.textContent = '';
  setTimeout(() => {
    if (region) region.textContent = message;
  }, 50);
}
