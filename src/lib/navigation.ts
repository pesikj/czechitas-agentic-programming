// Navigation over the repository-derived lecture sequence. Shared by links and commands,
// so clickable navigation and /next, /back always agree. Never wraps around.
import type { CommandContext, LectureTarget } from './commands';
import type { ContentModel, Lecture, Part } from './content/types';

export function partHref(lectureId: string, partId: string): string {
  return `/lekce/${encodeURIComponent(lectureId)}/${encodeURIComponent(partId)}`;
}

/** Link to a lecture: its first part. */
export function lectureHref(lecture: Lecture): string {
  return partHref(lecture.id, lecture.parts[0]!.id);
}

export function findLecture(model: ContentModel, lectureId: string): Lecture | undefined {
  return model.lectures.find((lecture) => lecture.id === lectureId);
}

export function findPart(lecture: Lecture, partId: string): Part | undefined {
  return lecture.parts.find((part) => part.id === partId);
}

export interface Neighbours {
  previous?: Part;
  next?: Part;
  /** The lecture before/after this one in navigation order (across groups). */
  previousLecture?: Lecture;
  nextLecture?: Lecture;
  isFirst: boolean;
  isLast: boolean;
}

export function neighbours(model: ContentModel, lecture: Lecture, part: Part): Neighbours {
  const partIndex = lecture.parts.indexOf(part);
  const lectureIndex = model.lectures.indexOf(lecture);
  const previous = lecture.parts[partIndex - 1];
  const next = lecture.parts[partIndex + 1];
  const previousLecture = model.lectures[lectureIndex - 1];
  const nextLecture = model.lectures[lectureIndex + 1];
  return {
    ...(previous ? { previous } : {}),
    ...(next ? { next } : {}),
    ...(previousLecture ? { previousLecture } : {}),
    ...(nextLecture ? { nextLecture } : {}),
    isFirst: partIndex === 0,
    isLast: partIndex === lecture.parts.length - 1,
  };
}

/** File-like name shown in navigation and the breadcrumb, e.g. `02-instalace`. */
export function partFileName(part: Part): string {
  return `${String(part.number).padStart(2, '0')}-${part.id}`;
}

/** 1-based lecture number in navigation order, as used by `/open <number>`. */
export function lectureNumber(model: ContentModel, lecture: Lecture): number {
  return model.lectures.indexOf(lecture) + 1;
}

/** Lectures and their parts for the command bar (`/open`). */
export function lectureTargets(model: ContentModel | undefined): LectureTarget[] {
  return (model?.lectures ?? []).map((lecture, index) => ({
    number: index + 1,
    id: lecture.id,
    title: lecture.title,
    href: lectureHref(lecture),
    parts: lecture.parts.map((part) => ({ number: part.number, title: part.title, href: partHref(lecture.id, part.id) })),
  }));
}

/** Command-bar context for the home page. */
export function homeContext(model: ContentModel | undefined): CommandContext {
  return { page: 'home', lectures: lectureTargets(model) };
}

/** Command-bar context for a lecture part. */
export function partContext(model: ContentModel, lecture: Lecture, part: Part): CommandContext {
  const lectures = lectureTargets(model);
  const number = lectureNumber(model, lecture);
  const around = neighbours(model, lecture, part);
  const previousLecture = lectures[number - 2];
  const nextLecture = lectures[number];
  return {
    page: 'part',
    lectures,
    lectureNumber: number,
    ...(around.previous ? { previous: { title: around.previous.title, href: partHref(lecture.id, around.previous.id) } } : {}),
    ...(around.next ? { next: { title: around.next.title, href: partHref(lecture.id, around.next.id) } } : {}),
    ...(previousLecture ? { previousLecture } : {}),
    ...(nextLecture ? { nextLecture } : {}),
  };
}

/** Command-bar context for pages outside lectures (errors, not found). */
export function otherContext(model: ContentModel | undefined): CommandContext {
  return { page: 'other', lectures: lectureTargets(model) };
}
