import { describe, expect, it } from 'vitest';
import { exportFileName, responsesToMarkdown } from '../src/lib/export';

describe('Markdown export', () => {
  it('keeps answers verbatim with exercise and field labels', () => {
    const markdown = responsesToMarkdown(
      [
        {
          exerciseId: 'prvni-prompt',
          exerciseRevision: 2,
          exerciseTitle: 'Váš první prompt',
          lectureTitle: 'Úvod',
          partTitle: 'Cvičení',
          fieldLabels: { prompt: 'Použitý prompt', reflexe: 'Reflexe' },
          fields: { prompt: '```text\nPřidej patičku\n```\n\n- **tučně**', reflexe: '' },
          savedAt: new Date('2026-10-05T10:00:00Z'),
        },
      ],
      { title: 'Moje odpovědi', subtitle: 'Kurz · jana@example.test', exportedAt: new Date('2026-10-05T12:00:00Z') },
    );
    expect(markdown).toContain('# Moje odpovědi');
    expect(markdown).toContain('## Úvod › Cvičení: Váš první prompt');
    expect(markdown).toContain('Cvičení `prvni-prompt`, revize 2');
    expect(markdown).toContain('### Použitý prompt\n\n```text\nPřidej patičku\n```\n\n- **tučně**');
    expect(markdown).toContain('### Reflexe\n\n_(nevyplněno)_');
  });

  it('groups answers by course title when there are several courses', () => {
    const record = (courseTitle: string, exerciseId: string) => ({
      exerciseId,
      exerciseRevision: 1,
      exerciseTitle: exerciseId,
      lectureTitle: null,
      partTitle: null,
      courseTitle,
      fieldLabels: { a: 'Pole' },
      fields: { a: 'Text' },
      savedAt: new Date('2026-10-05T10:00:00Z'),
    });
    const markdown = responsesToMarkdown([record('A', 'prvni'), record('B', 'druhe')], { title: 'Odpovědi' });
    expect(markdown).toContain('## A\n');
    expect(markdown).toContain('## B\n');
    expect(markdown).toContain('### prvni\n');
    expect(markdown).toContain('#### Pole\n\nText');
    expect(markdown.indexOf('## A')).toBeLessThan(markdown.indexOf('## B'));

    const single = responsesToMarkdown([record('A', 'prvni')], { title: 'Odpovědi' });
    expect(single).not.toContain('## A');
    expect(single).toContain('## prvni\n');
    expect(single).toContain('### Pole\n');
  });

  it('builds safe file names', () => {
    expect(exportFileName('odpovedi-Jana.Nováková@example.test')).toBe('odpovedi-jana-novakova-example-test.md');
    expect(exportFileName('…')).toBe('odpovedi.md');
  });
});
