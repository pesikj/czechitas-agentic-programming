// Access control: only signed-in users with active accounts reach course pages and images,
// except the title pages and lectures the content marks as public (and their images), which anyone can read.
import { defineMiddleware } from 'astro:middleware';
import { isPublicContentPath } from './lib/content/visibility';
import { withNext } from './server/auth/redirect';
import { sessionCookieName, sessionCookieOptions, validateSession } from './server/auth/sessions';
import { getContent } from './server/content/provider';

const PUBLIC_PATHS = new Set(['/prihlaseni', '/zapomenute-heslo', '/odhlaseni']);
const PUBLIC_PATHS_STATIC = new Set(['/theme-init.js', '/health']);
const PUBLIC_PREFIXES = ['/obnova-hesla/', '/_astro/', '/_image'];
/** While a password change is required, only these pages are reachable. */
const PASSWORD_CHANGE_PATHS = new Set(['/zmena-hesla', '/odhlaseni']);

const isPublic = (path: string) =>
  PUBLIC_PATHS.has(path) || PUBLIC_PATHS_STATIC.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, locals, request } = context;
  const path = url.pathname;
  const cookieName = sessionCookieName();
  const token = cookies.get(cookieName)?.value;

  if (token) {
    const result = await validateSession(token);
    if (result) {
      locals.user = result.user;
      locals.session = result.session;
      locals.sessionToken = token;
      if (result.refreshed) cookies.set(cookieName, token, sessionCookieOptions(result.session.expiresAt));
    } else {
      cookies.delete(cookieName, { path: '/' });
    }
  }

  let publicContent = false;
  const response = await guard();
  return withSecurityHeaders(response, url, Boolean(locals.user) || publicContent);

  async function guard(): Promise<Response> {
    if (isPublic(path)) return next();
    const target = url.pathname + url.search;
    const wantsPage = request.method === 'GET' && !path.startsWith('/obsah/');
    if (!locals.user && (await isPublicContent())) {
      publicContent = true;
      return next();
    }
    if (!locals.user) {
      // Pages lead to sign-in; images and other resources get a bare 401 (never content).
      return wantsPage
        ? context.redirect(withNext('/prihlaseni', target), 303)
        : new Response('Přihlaste se.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (locals.user.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(path)) {
      return wantsPage
        ? context.redirect(withNext('/zmena-hesla', target), 303)
        : new Response('Nejdřív si nastavte heslo.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return next();
  }

  /** Title pages, lectures marked public and their images are readable without signing in (GET only). */
  async function isPublicContent(): Promise<boolean> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    // The title pages list only public lectures to visitors.
    if (path === '/') return true;
    // If the content cannot be loaded, fall back to requiring sign-in.
    const { model: catalog } = await getContent().catch(() => ({ model: undefined }));
    if (!catalog) return false;
    if (catalog.courses.slice(1).some((course) => path === `/${course.id}` || path === `/${course.id}/`)) return true;
    return isPublicContentPath(catalog, path);
  }
});

function withSecurityHeaders(original: Response, url: URL, personal: boolean): Response {
  const path = url.pathname;
  // Copy, because some responses (e.g. redirects) have immutable headers.
  const response = new Response(original.body, original);
  const headers = response.headers;
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  // Reset links carry a secret in the URL: same-origin never sends it to other sites. (no-referrer
  // would make browsers send "Origin: null" on form posts, which the origin check rejects.)
  headers.set('Referrer-Policy', 'same-origin');
  // The hosting proxy terminates HTTPS; the forwarded protocol tells whether this request used it.
  if (url.protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  const isPage = headers.get('Content-Type')?.includes('text/html');
  // The same address renders differently signed in and out, so no page with content is cached.
  if (isPage && (personal || path.startsWith('/obnova-hesla/') || path === '/zmena-hesla')) {
    headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}
