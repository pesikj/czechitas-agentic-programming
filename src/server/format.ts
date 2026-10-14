// Czech display helpers shared by admin and learner pages.
const dateTime = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' });

export function formatDateTime(date: Date | null | undefined): string {
  return date ? dateTime.format(date) : '—';
}

/** Czech plural: 1 lekce, 2–4 lekce, 5+ lekcí. */
export function czechCount(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

export const shortSha = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : '—');
