// Markdown export of saved responses. Answers are already Markdown and are kept verbatim.
export interface ExportRecord {
  exerciseId: string;
  exerciseRevision: number;
  exerciseTitle: string | null;
  lectureTitle: string | null;
  partTitle: string | null;
  /** When the records span several courses, they are grouped under their course titles. */
  courseTitle?: string | null;
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

  const grouped = new Set(records.map((record) => record.courseTitle ?? null)).size > 1;
  const recordHeading = grouped ? '###' : '##';
  const fieldHeading = grouped ? '####' : '###';
  let currentCourse: string | null | undefined;

  for (const record of records) {
    if (grouped && record.courseTitle !== currentCourse) {
      currentCourse = record.courseTitle;
      lines.push(`## ${currentCourse ?? ''}`, '');
    }
    const location = [record.lectureTitle, record.partTitle].filter(Boolean).join(' › ');
    const name = record.exerciseTitle ?? record.exerciseId;
    lines.push('---', '', `${recordHeading} ${location ? `${location}: ` : ''}${name}`, '');
    lines.push(`Cvičení \`${record.exerciseId}\`, revize ${record.exerciseRevision} · uloženo ${date.format(record.savedAt)}`, '');
    for (const [fieldId, value] of Object.entries(record.fields)) {
      lines.push(`${fieldHeading} ${record.fieldLabels[fieldId] ?? fieldId}`, '', value.trim() === '' ? '_(nevyplněno)_' : value.trimEnd(), '');
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

/** The course named in an export's subtitle: that of a single group; none for several (the `##` headings name them). */
export function exportCourseTitle(groups: { title: string }[]): string | undefined {
  return groups.length === 1 ? groups[0]!.title : undefined;
}
