import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ redirect }) => redirect('/admin/uzivatele', 302);
