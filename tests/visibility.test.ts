import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/lib/content';
import { isPublicContentPath, publicModel, visibleModel } from '../src/lib/content/visibility';

// The e2e fixture marks only the "shrnuti" lecture as public.
const { model: catalog } = await loadContent('fixtures/content/e2e');
const model = catalog?.courses[0];

describe('public lectures', () => {
  it('reads `public` from lecture.yaml, defaulting to false', () => {
    expect(model!.lectures.map((lecture) => [lecture.id, lecture.public])).toEqual([
      ['uvod-do-agentu', false],
      ['prace-s-promptem', false],
      ['shrnuti', true],
    ]);
  });

  it('reduces the model to public lectures, their exercises and non-empty groups', () => {
    const visible = publicModel(model!);
    expect(visible.lectures.map((lecture) => lecture.id)).toEqual(['shrnuti']);
    expect(visible.toc).toEqual([{ kind: 'lecture', lectureId: 'shrnuti' }]);
    expect([...visible.exercises.keys()]).toEqual(['shrnuti-reflexe']);
    expect(visibleModel(model, true)).toBe(model);
  });

  it('allows only public lecture pages and their images', () => {
    const allowed = ['/lekce/shrnuti', '/lekce/shrnuti/shrnuti-kurzu', '/lekce/shrnuti/', '/obsah/lectures/03-shrnuti/images/postup.png'];
    const denied = [
      '/lekce/uvod-do-agentu/co-je-agent',
      '/lekce/shrnuti/a/b',
      '/obsah/lectures/01-uvod/images/pracovni-postup.png',
      '/obsah/lectures/03-shrnuti/shrnuti.md',
      '/obsah/lectures/03-shrnuti/images/postup.png%',
      '/hledat',
      '/',
    ];
    for (const path of allowed) expect(isPublicContentPath(catalog!, path), path).toBe(true);
    for (const path of denied) expect(isPublicContentPath(catalog!, path), path).toBe(false);
  });
});
