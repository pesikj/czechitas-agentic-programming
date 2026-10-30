// Navigation over the repository-derived lecture sequence. Shared by links and commands,
// so clickable navigation and /next, /back always agree. Never wraps around.
import type { CommandContext, CourseTarget, LectureTarget } from './commands';
import type { Catalog, ContentModel, Lecture, Part } from './content/types';

export function partHref(lecture: Pick<Lecture, 'id' | 'basePath'>, partId: string): string {
  return `${lecture.basePath}/lekce/${encodeURIComponent(lecture.id)}/${encodeURIComponent(partId)}`;
}

/** Link to a lecture: its first part. */
export function lectureHref(lecture: Lecture): string {
  return partHref(lecture, lecture.parts[0]!.id);
}

/** A course's title page with its lecture list. */
export function courseHref(course: Pick<ContentModel, 'basePath'>): string {
  return `${course.basePath}/`;
}

/** A course's search page, with results for `query` if given. */
export function searchHref(course: Pick<ContentModel, 'basePath'>, query?: string): string {
  return `${course.basePath}/hledat${query ? `?q=${encodeURIComponent(query)}` : ''}`;
}

/** Courses for the command bar (`/course`), numbered in declaration order. */
export function courseTargets(catalog: Catalog | undefined): CourseTarget[] {
  return (catalog?.courses ?? []).map((course, index) => ({
    number: index + 1,
    id: course.id,
    title: course.title,
    href: courseHref(course),
    basePath: course.basePath,
  }));
}

export function findLecture(model: ContentModel, lectureId: string): Lecture | undefined {
  return model.lectures.find((lecture) => lecture.id === lectureId);
}

export function findPart(lecture: Lecture, partId: string): Part | undefined {
  return lecture.parts.find((part) => part.id === partId);
}

/**
 * How a lecture part page answers, given the course as the user may see it: `not-found` for a
 * lecture the course does not have, otherwise the status (404 for a missing part or no content
 * yet, 500 for invalid content).
 */
export function partStatus(
  model: ContentModel | undefined,
  state: 'ready' | 'invalid' | 'empty',
  lectureId: string,
  partId: string,
): 'not-found' | 200 | 404 | 500 {
  if (!model) return state === 'empty' ? 404 : 500;
  const lecture = findLecture(model, lectureId);
  if (!lecture) return 'not-found';
  return findPart(lecture, partId) ? 200 : 404;
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
    parts: lecture.parts.map((part) => ({ number: part.number, title: part.title, href: partHref(lecture, part.id) })),
  }));
}

/** The courses and the current one, shared by every command-bar context. */
function courseContext(model: ContentModel | undefined, courses: CourseTarget[]) {
  return { courses, ...(model ? { currentCourse: model.id } : {}) };
}

/** Command-bar context for a course's title page. */
export function homeContext(model: ContentModel | undefined, courses: CourseTarget[] = []): CommandContext {
  return { page: 'home', lectures: lectureTargets(model), ...courseContext(model, courses) };
}

/** Command-bar context for a lecture part. */
export function partContext(model: ContentModel, lecture: Lecture, part: Part, courses: CourseTarget[] = []): CommandContext {
  const lectures = lectureTargets(model);
  const number = lectureNumber(model, lecture);
  const around = neighbours(model, lecture, part);
  const previousLecture = lectures[number - 2];
  const nextLecture = lectures[number];
  return {
    page: 'part',
    lectures,
    lectureNumber: number,
    ...(around.previous ? { previous: { title: around.previous.title, href: partHref(lecture, around.previous.id) } } : {}),
    ...(around.next ? { next: { title: around.next.title, href: partHref(lecture, around.next.id) } } : {}),
    ...(previousLecture ? { previousLecture } : {}),
    ...(nextLecture ? { nextLecture } : {}),
    ...courseContext(model, courses),
  };
}

/** Command-bar context for pages outside lectures (errors, not found). */
export function otherContext(model: ContentModel | undefined, courses: CourseTarget[] = []): CommandContext {
  return { page: 'other', lectures: lectureTargets(model), ...courseContext(model, courses) };
}
