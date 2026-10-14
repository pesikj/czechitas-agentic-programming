import type { AstroGlobal } from 'astro';
import { getConfig } from '../config';

/**
 * Client address for rate limiting. Behind the reverse proxy (TRUST_PROXY=true) it is the last
 * X-Forwarded-For entry, i.e. the address the proxy itself saw.
 */
export function clientAddress(astro: Pick<AstroGlobal, 'clientAddress' | 'request'>): string {
  if (getConfig().TRUST_PROXY) {
    const forwarded = astro.request.headers.get('x-forwarded-for');
    const last = forwarded?.split(',').at(-1)?.trim();
    if (last) return last;
  }
  try {
    return astro.clientAddress ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function formField(form: FormData, name: string): Promise<string> {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
