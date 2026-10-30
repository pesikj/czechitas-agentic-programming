// Full-text search over one content revision. Pure; the index is built with the revision snapshot,
// with the documents of every course (each search filters them to one course).
import type { Nodes } from 'mdast';
import { toString as toText } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import { EXERCISE_LANG, parseMarkdown } from './content/markdown';
import type { ContentModel } from './content/types';
import { partHref } from './navigation';

export interface SearchDocument {
  courseId: string;
  href: string;
  lectureTitle: string;
  partTitle: string;
  partNumber: number;
  text: string;
  /** `text` folded to lowercase without diacritics, same length so indexes line up. */
  folded: string;
  foldedTitle: string;
}

export interface SearchHit {
  href: string;
  lectureTitle: string;
  partTitle: string;
  partNumber: number;
  snippet: { before: string; match: string; after: string };
}

/** Lowercase, without diacritics, character for character (keeps string length). */
export function fold(text: string): string {
  let result = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    const base = char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    result += base.length === 1 ? base : char.toLowerCase().length === 1 ? char.toLowerCase() : char;
  }
  return result;
}

function plainText(source: string, title: string): string {
  const pieces: string[] = [];
  visit(parseMarkdown(source, 'content'), (node: Nodes) => {
    if (node.type === 'yaml') return 'skip';
    if (node.type === 'heading' && toText(node).trim() === title.trim()) return 'skip';
    if (node.type === 'code') {
      if (node.lang !== EXERCISE_LANG) pieces.push(node.value);
      return 'skip';
    }
    // Whole blocks at once, so inline formatting (**prompt**u) does not split words.
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'tableCell') {
      pieces.push(toText(node));
      return 'skip';
    }
    return undefined;
  });
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}

/** The search documents of one course. */
export function buildSearchIndex(model: ContentModel): SearchDocument[] {
  return model.lectures.flatMap((lecture) =>
    lecture.parts.map((part) => {
      const text = plainText(part.source, part.title);
      return {
        courseId: model.id,
        href: partHref(lecture, part.id),
        lectureTitle: lecture.title,
        partTitle: part.title,
        partNumber: part.number,
        text,
        folded: fold(text),
        foldedTitle: fold(`${lecture.title} ${part.title}`),
      };
    }),
  );
}

const SNIPPET_RADIUS = 80;

/** Parts containing every word of the query (case- and diacritics-insensitive), best first. */
export function search(index: SearchDocument[], query: string, limit = 50): SearchHit[] {
  const terms = fold(query)
    .split(/\s+/)
    .filter((term) => term.length >= 2);
  if (terms.length === 0) return [];

  const scored = index.flatMap((document) => {
    let score = 0;
    for (const term of terms) {
      const inTitle = document.foldedTitle.includes(term);
      const occurrences = document.folded.split(term).length - 1;
      if (!inTitle && occurrences === 0) return [];
      score += (inTitle ? 10 : 0) + Math.min(occurrences, 5);
    }
    return [{ document, score }];
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ document }) => ({
      href: document.href,
      lectureTitle: document.lectureTitle,
      partTitle: document.partTitle,
      partNumber: document.partNumber,
      snippet: snippetFor(document, terms),
    }));
}

function snippetFor(document: SearchDocument, terms: string[]): SearchHit['snippet'] {
  const positions = terms.map((term) => [document.folded.indexOf(term), term.length] as const).filter(([at]) => at >= 0);
  if (positions.length === 0) {
    return { before: '', match: '', after: document.text.slice(0, SNIPPET_RADIUS * 2) + (document.text.length > SNIPPET_RADIUS * 2 ? '…' : '') };
  }
  const [at, length] = positions.sort((a, b) => a[0] - b[0])[0]!;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(document.text.length, at + length + SNIPPET_RADIUS);
  return {
    before: (start > 0 ? '…' : '') + document.text.slice(start, at),
    match: document.text.slice(at, at + length),
    after: document.text.slice(at + length, end) + (end < document.text.length ? '…' : ''),
  };
}
