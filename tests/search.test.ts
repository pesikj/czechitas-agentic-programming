import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/lib/content/index';
import { buildSearchIndex, fold, search } from '../src/lib/search';

const { model } = await loadContent(path.resolve('fixtures/content/e2e'));
const index = buildSearchIndex(model!.courses[0]!);

describe('search', () => {
  it('folds case and diacritics without changing length', () => {
    expect(fold('Příliš ŽLUŤOUČKÝ')).toBe('prilis zlutoucky');
    expect(fold('Příliš ŽLUŤOUČKÝ')).toHaveLength('Příliš ŽLUŤOUČKÝ'.length);
  });

  it('finds parts by words in any case or diacritics, linking to the part', () => {
    const hits = search(index, 'zlutoucky KUN');
    const intro = hits.find((hit) => hit.href === '/lekce/uvod-do-agentu/co-je-agent');
    expect(intro).toMatchObject({ partTitle: 'Co je programovací agent', lectureTitle: 'Úvod do agentního programování' });
    expect(intro!.snippet.match.toLowerCase()).toBe('žluťoučký');
    // The long part repeats the phrase, so it ranks higher.
    expect(hits[0]!.href).toBe('/lekce/prace-s-promptem/iterace');
  });

  it('keeps words whole across inline formatting', () => {
    const hit = search(index, 'promptu').find((candidate) => candidate.href === '/lekce/uvod-do-agentu/co-je-agent');
    expect(hit?.snippet.before + hit!.snippet.match + hit!.snippet.after).toContain('zadání (promptu) čte');
  });

  it('ranks title matches first and requires every word', () => {
    expect(search(index, 'instalace')[0]?.partTitle).toBe('Instalace nástrojů');
    expect(search(index, 'instalace neexistujicislovo')).toEqual([]);
    expect(search(index, 'a')).toEqual([]);
  });

  it('indexes code and image descriptions but not exercise definitions', () => {
    expect(search(index, 'node --version').map((hit) => hit.partTitle)).toContain('Instalace nástrojů');
    expect(search(index, 'Schéma zadání').length).toBeGreaterThan(0);
    expect(search(index, 'prvni-prompt-reflexe')).toEqual([]);
  });
});
