/** Returns a same-origin path to continue to after sign-in, or "/" for anything unsafe. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f]/.test(value)) return '/';
  try {
    const url = new URL(value, 'http://localhost');
    if (url.origin !== 'http://localhost') return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

/** Builds `/prihlaseni?next=…` style links, omitting the default target. */
export function withNext(path: string, next: string): string {
  const target = safeNext(next);
  return target === '/' ? path : `${path}?next=${encodeURIComponent(target)}`;
}
