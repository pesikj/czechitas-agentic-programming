import type { APIRoute } from 'astro';
import { resolveAsset } from '../../server/content/provider';

/** Content images and linked files. Only assets referenced by the current content are served (allowlist). */
export const GET: APIRoute = async ({ params }) => {
  const asset = await resolveAsset(params.path ?? '');
  if (!asset) return new Response('Nenalezeno', { status: 404 });

  const headers: Record<string, string> = {
    'Content-Type': asset.contentType,
    'X-Content-Type-Options': 'nosniff',
    // Private: protected content must not be stored by shared caches.
    'Cache-Control': 'private, max-age=300',
  };
  if (asset.contentType === 'image/svg+xml') headers['Content-Security-Policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
  if (!asset.contentType.startsWith('image/')) {
    // Linked files (data, scripts, …) are downloaded, never rendered by the browser.
    const name = asset.path.split('/').pop()!;
    headers['Content-Disposition'] = `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
    headers['Content-Security-Policy'] = "sandbox; default-src 'none'";
  }
  return new Response(new Uint8Array(asset.body), { headers });
};
