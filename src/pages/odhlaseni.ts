import type { APIRoute } from 'astro';
import { deleteSession, sessionCookieName } from '../server/auth/sessions';

/** Sign-out is POST only, so a link or image elsewhere cannot sign users out. */
export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  if (locals.sessionToken) await deleteSession(locals.sessionToken);
  cookies.delete(sessionCookieName(), { path: '/' });
  return redirect('/prihlaseni?odhlaseno=1', 303);
};

export const GET: APIRoute = ({ redirect }) => redirect('/', 303);
