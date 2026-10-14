// Markdown export of saved responses. Answers are already Markdown and are kept verbatim.
export interface ExportRecord {
  exerciseId: string;
  exerciseRevision: number;
  exerciseTitle: string | null;
  lectureTitle: string | null;
  partTitle: string | null;
  fieldLabels: Record<string, string>;
  fields: Record<string, string>;
  savedAt: Date;
}

const date = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' });

export function responsesToMarkdown(records: ExportRecord[], heading: { title: string; subtitle?: string; exportedAt?: Date }): string {
  const lines = [`# ${heading.title}`, ''];
  if (heading.subtitle) lines.push(heading.subtitle, '');
  lines.push(`Exportováno: ${date.format(heading.exportedAt ?? new Date())}`, '');
  if (records.length === 0) lines.push('Žádné uložené odpovědi.', '');

  for (const record of records) {
    const location = [record.lectureTitle, record.partTitle].filter(Boolean).join(' › ');
    const name = record.exerciseTitle ?? record.exerciseId;
    lines.push('---', '', `## ${location ? `${location}: ` : ''}${name}`, '');
    lines.push(`Cvičení \`${record.exerciseId}\`, revize ${record.exerciseRevision} · uloženo ${date.format(record.savedAt)}`, '');
    for (const [fieldId, value] of Object.entries(record.fields)) {
      lines.push(`### ${record.fieldLabels[fieldId] ?? fieldId}`, '', value.trim() === '' ? '_(nevyplněno)_' : value.trimEnd(), '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** A safe ASCII file name for downloads. */
export function exportFileName(base: string): string {
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'odpovedi'}.md`;
}

export function markdownDownload(markdown: string, fileName: string): Response {
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
