import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentModel } from '../src/lib/content/index';
import {
  courseHref,
  courseTargets,
  findLecture,
  findPart,
  homeContext,
  lectureHref,
  lectureTargets,
  neighbours,
  partContext,
  partFileName,
  partHref,
  searchHref,
} from '../src/lib/navigation';

const { model: catalog } = await loadContent(path.resolve('fixtures/content/courses'));
if (!catalog) throw new Error('courses fixture must load');
const [model, dataCourse] = catalog.courses as [ContentModel, ContentModel];

const lecture = (id: string) => findLecture(model, id)!;
const part = (lectureId: string, partId: string) => findPart(lecture(lectureId), partId)!;

describe('navigation', () => {
  it('builds stable part links', () => {
    expect(partHref({ id: 'zaklady', basePath: '' }, 'uvod')).toBe('/lekce/zaklady/uvod');
    expect(partHref({ id: 'tabulky', basePath: '/data' }, 'uvod')).toBe('/data/lekce/tabulky/uvod');
    expect(lectureHref(lecture('zaklady'))).toBe('/lekce/zaklady/uvod');
    expect(partFileName(part('zaklady', 'prvni-cviceni'))).toBe('02-prvni-cviceni');
  });

  it('returns undefined for unknown ids', () => {
    expect(findLecture(model, 'neexistuje')).toBeUndefined();
    expect(findPart(lecture('zaklady'), 'neexistuje')).toBeUndefined();
  });

  it('finds neighbours inside a lecture without wrapping', () => {
    const first = neighbours(model, lecture('zaklady'), part('zaklady', 'uvod'));
    expect(first).toMatchObject({ isFirst: true, isLast: false });
    expect(first.previous).toBeUndefined();
    expect(first.next?.id).toBe('prvni-cviceni');
    expect(first.previousLecture).toBeUndefined();

    const last = neighbours(model, lecture('zaklady'), part('zaklady', 'prvni-cviceni'));
    expect(last).toMatchObject({ isFirst: false, isLast: true });
    expect(last.next).toBeUndefined();
    expect(last.nextLecture?.id).toBe('prompty');
  });

  it('crosses group boundaries in navigation order', () => {
    const around = neighbours(model, lecture('prompty'), part('prompty', 'psani-promptu'));
    expect(around).toMatchObject({ isFirst: true, isLast: true });
    expect(around.previousLecture?.id).toBe('zaklady');
    expect(around.nextLecture?.id).toBe('zaver');

    const end = neighbours(model, lecture('zaver'), part('zaver', 'shrnuti'));
    expect(end.nextLecture).toBeUndefined();
  });

  it('numbers lectures in navigation order for /open', () => {
    expect(lectureTargets(model).map((target) => [target.number, target.id, target.parts.length])).toEqual([
      [1, 'zaklady', 2],
      [2, 'prompty', 1],
      [3, 'zaver', 1],
    ]);
    expect(lectureTargets(model)[0]!.parts[1]).toEqual({ number: 2, title: 'První cvičení', href: '/lekce/zaklady/prvni-cviceni' });
  });

  it('builds command contexts', () => {
    expect(homeContext(model)).toEqual({ page: 'home', lectures: lectureTargets(model), courses: [], currentCourse: 'agent' });
    expect(partContext(model, lecture('zaklady'), part('zaklady', 'prvni-cviceni'))).toEqual({
      page: 'part',
      lectures: lectureTargets(model),
      courses: [],
      currentCourse: 'agent',
      lectureNumber: 1,
      previous: { title: 'Úvod', href: '/lekce/zaklady/uvod' },
      nextLecture: lectureTargets(model)[1],
    });
    const middle = partContext(model, lecture('prompty'), part('prompty', 'psani-promptu'));
    expect(middle.page === 'part' && [middle.lectureNumber, middle.previousLecture?.id, middle.nextLecture?.id]).toEqual([
      2,
      'zaklady',
      'zaver',
    ]);
  });

  it('links courses and their search pages', () => {
    expect(courseHref({ basePath: '' })).toBe('/');
    expect(courseHref({ basePath: '/data' })).toBe('/data/');
    expect(searchHref({ basePath: '' })).toBe('/hledat');
    expect(searchHref({ basePath: '/data' }, 'kontingenční tabulka')).toBe('/data/hledat?q=kontingen%C4%8Dn%C3%AD%20tabulka');
  });

  it('lists the courses for /course', () => {
    expect(courseTargets(catalog)).toEqual([
      { number: 1, id: 'agent', title: 'Testovací kurz', href: '/', basePath: '' },
      { number: 2, id: 'data', title: 'Digitální akademie: Data', href: '/data/', basePath: '/data' },
    ]);
    expect(courseTargets(undefined)).toEqual([]);
  });

  it('builds the contexts of an additional course', () => {
    const targets = courseTargets(catalog);
    expect(homeContext(dataCourse, targets)).toEqual({
      page: 'home',
      lectures: lectureTargets(dataCourse),
      courses: targets,
      currentCourse: 'data',
    });
    expect(lectureTargets(dataCourse)).toEqual([
      {
        number: 1,
        id: 'tabulky',
        title: '1 – Tabulky',
        href: '/data/lekce/tabulky/uvod',
        parts: [{ number: 1, title: 'Úvod do tabulek', href: '/data/lekce/tabulky/uvod' }],
      },
    ]);
  });
});
