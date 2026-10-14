import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/lib/content/index';
import {
  findLecture,
  findPart,
  homeContext,
  lectureHref,
  lectureTargets,
  neighbours,
  partContext,
  partFileName,
  partHref,
} from '../src/lib/navigation';

const { model } = await loadContent(path.resolve('fixtures/content/minimal'));
if (!model) throw new Error('minimal fixture must load');

const lecture = (id: string) => findLecture(model, id)!;
const part = (lectureId: string, partId: string) => findPart(lecture(lectureId), partId)!;

describe('navigation', () => {
  it('builds stable part links', () => {
    expect(partHref('zaklady', 'uvod')).toBe('/lekce/zaklady/uvod');
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
    expect(homeContext(model)).toEqual({ page: 'home', lectures: lectureTargets(model) });
    expect(partContext(model, lecture('zaklady'), part('zaklady', 'prvni-cviceni'))).toEqual({
      page: 'part',
      lectures: lectureTargets(model),
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
});
