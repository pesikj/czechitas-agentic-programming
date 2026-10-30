import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/lib/content';
import { isPublicContentPath, publicModel, visibleModel } from '../src/lib/content/visibility';
import type { Catalog, ContentModel, Lecture } from '../src/lib/content/types';

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

describe('public paths across courses', () => {
  const lecture = (courseId: string, basePath: string, id: string, isPublic: boolean, assets: string[] = []): Lecture => ({
    id,
    courseId,
    basePath,
    title: id,
    public: isPublic,
    dir: `${basePath ? 'data/' : ''}lectures/${id}`,
    parts: [
      {
        id: 'x',
        lectureId: id,
        title: 'x',
        number: 1,
        file: 'x.md',
        source: '',
        exercises: [],
        assets: assets.map((path) => ({ kind: 'image', url: path, path, exists: true })),
      },
    ],
  });
  const course = (id: string, basePath: string, lectures: Lecture[]): ContentModel => ({
    id,
    title: id,
    basePath,
    toc: lectures.map((item) => ({ kind: 'lecture', lectureId: item.id })),
    lectures,
    exercises: new Map(),
  });
  const twoCourses: Catalog = {
    courses: [
      course('agent', '', [lecture('agent', '', 'uvod', true), lecture('agent', '', 'prompty', false)]),
      course('data', '/data', [
        lecture('data', '/data', 'tabulky', true, ['data/lectures/01-tabulky/images/a.png']),
        lecture('data', '/data', 'grafy', false, ['data/lectures/02-grafy/images/b.png']),
      ]),
    ],
    exercises: new Map(),
  };

  it('allows public lectures under their own course prefix only', () => {
    const allowed = ['/lekce/uvod/x', '/data/lekce/tabulky/x', '/data/lekce/tabulky', '/obsah/data/lectures/01-tabulky/images/a.png'];
    const denied = [
      '/lekce/prompty/x',
      '/data/lekce/grafy/x',
      '/obsah/data/lectures/02-grafy/images/b.png',
      // A lecture is public only under its own course.
      '/lekce/tabulky/x',
      '/data/lekce/uvod/x',
      '/agent/lekce/uvod/x',
      '/neexistuje/lekce/uvod/x',
      '/data/lekce/tabulky/x/y',
      '/data',
    ];
    for (const path of allowed) expect(isPublicContentPath(twoCourses, path), path).toBe(true);
    for (const path of denied) expect(isPublicContentPath(twoCourses, path), path).toBe(false);
  });
});
