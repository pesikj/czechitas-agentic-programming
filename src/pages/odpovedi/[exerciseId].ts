import type { APIRoute } from 'astro';
import { safeNext } from '../../server/auth/redirect';
import { getContent } from '../../server/content/provider';
import { formatDateTime } from '../../server/format';
import { saveResponse } from '../../server/responses';

const FIELD_PREFIX = 'pole.';

/**
 * Saves the signed-in learner's answer. With JavaScript the editor posts and reads JSON; without
 * it, the form posts normally and is redirected back to the exercise.
 */
export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const user = locals.user!;
  const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;
  const form = await request.formData();
  const back = safeNext(typeof form.get('return') === 'string' ? (form.get('return') as string) : '/');
  const anchor = `#cviceni-${encodeURIComponent(params.exerciseId ?? '')}`;

  const reply = (status: number, body: { ok: boolean; message: string; savedAt?: string; savedAtLabel?: string }) =>
    wantsJson
      ? new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
      : redirect(`${back}${back.includes('?') ? '&' : '?'}${body.ok ? 'ulozeno' : 'chyba'}=${encodeURIComponent(params.exerciseId ?? '')}${anchor}`, 303);

  const content = await getContent();
  const exercise = content.model?.exercises.get(params.exerciseId ?? '');
  if (!content.model || !exercise) {
    return reply(404, { ok: false, message: 'Toto cvičení už v aktuálních materiálech není. Odpověď nelze uložit.' });
  }

  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (name.startsWith(FIELD_PREFIX) && typeof value === 'string') fields[name.slice(FIELD_PREFIX.length)] = value;
  }
  const result = await saveResponse({
    userId: user.id,
    exercise,
    model: content.model,
    ...(content.revision ? { contentRevisionId: content.revision.id } : {}),
    fields,
  });
  if (!result.ok) return reply(422, { ok: false, message: result.error });
  return reply(200, {
    ok: true,
    message: 'Odpověď je uložená.',
    savedAt: result.savedAt.toISOString(),
    savedAtLabel: formatDateTime(result.savedAt),
  });
};
