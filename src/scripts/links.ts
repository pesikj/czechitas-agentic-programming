/** Keep website navigation in this tab and open external websites in a new one. */
function updateLink(link: HTMLAnchorElement): void {
  let url: URL;
  try {
    url = new URL(link.href);
  } catch {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin !== window.location.origin) {
    link.target = '_blank';
    link.relList.add('noopener', 'noreferrer');
  } else {
    link.removeAttribute('target');
  }
}

function updateLinks(root: ParentNode): void {
  if (root instanceof HTMLAnchorElement && root.hasAttribute('href')) updateLink(root);
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(updateLink);
}

updateLinks(document);

// Answer previews and command output can add links after the page has loaded.
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes' && mutation.target instanceof HTMLAnchorElement) {
      updateLink(mutation.target);
    } else {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) updateLinks(node);
      });
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
