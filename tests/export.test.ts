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

  it('builds safe file names', () => {
    expect(exportFileName('odpovedi-Jana.Nováková@example.test')).toBe('odpovedi-jana-novakova-example-test.md');
    expect(exportFileName('…')).toBe('odpovedi.md');
  });
});
