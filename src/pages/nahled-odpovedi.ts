import type { APIRoute } from 'astro';
import { renderMarkdown } from '../lib/content/index';
import { MAX_FIELD_LENGTH } from '../server/responses';

/** Renders a response preview with the same Markdown dialect as everywhere else (sanitized). */
export const POST: APIRoute = async ({ request }) => {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return new Response('Unsupported content type', { status: 415 });
  }
  const body = (await request.json().catch(() => ({}))) as { markdown?: unknown };
  const markdown = typeof body.markdown === 'string' ? body.markdown.slice(0, MAX_FIELD_LENGTH) : '';
  const html = await renderMarkdown(markdown, { mode: 'response' });
  return new Response(JSON.stringify({ html }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
