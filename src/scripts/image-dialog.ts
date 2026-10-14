// Enlarged view for content images. The server renders each image as a link to the file.
const links = [...document.querySelectorAll<HTMLAnchorElement>('.prose a:has(> img)')];

if (links.length > 0) {
  const dialog = document.createElement('dialog');
  dialog.className = 'image-dialog';
  dialog.setAttribute('aria-label', 'Zvětšený obrázek');
  dialog.innerHTML = `
    <div class="dialog-bar">
      <figcaption></figcaption>
      <button type="button" class="dialog-close">Zavřít</button>
    </div>
    <img alt="" />`;
  document.body.append(dialog);
  const image = dialog.querySelector('img')!;
  const caption = dialog.querySelector('figcaption')!;
  let trigger: HTMLElement | undefined;

  const close = () => dialog.close();
  dialog.querySelector('.dialog-close')!.addEventListener('click', close);
  // A click on the backdrop (outside the content box) closes the dialog.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('close', () => trigger?.focus());

  for (const link of links) {
    const img = link.querySelector('img')!;
    link.setAttribute('aria-label', `Zvětšit obrázek: ${img.alt || 'bez popisu'}`);
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      trigger = link;
      image.src = img.currentSrc || img.src;
      image.alt = img.alt;
      caption.textContent = img.alt;
      dialog.showModal();
    });
  }
}
