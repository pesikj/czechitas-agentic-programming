// Content model produced from the content repository. See docs/content-contract.md.

export type Severity = 'error' | 'warning';

export type IssueCode =
  | 'course-missing'
  | 'course-id-reserved'
  | 'course-id-duplicate'
  | 'yaml-invalid'
  | 'schema-invalid'
  | 'id-invalid'
  | 'lecture-missing'
  | 'lecture-unlisted'
  | 'lecture-id-duplicate'
  | 'part-missing'
  | 'part-path-invalid'
  | 'part-unlisted'
  | 'part-id-duplicate'
  | 'exercise-invalid'
  | 'exercise-id-duplicate'
  | 'field-id-duplicate'
  | 'alternatives-invalid'
  | 'directive-unknown'
  | 'raw-html-ignored'
  | 'asset-missing'
  | 'asset-path-invalid'
  | 'asset-outside-repo'
  | 'asset-type-unsupported'
  | 'asset-external'
  | 'image-alt-missing';

export interface ValidationIssue {
  severity: Severity;
  code: IssueCode;
  /** Path relative to the content repository root. */
  file: string;
  line?: number;
  message: string;
}

export type TocNode =
  | { kind: 'group'; title: string; children: TocNode[] }
  | { kind: 'lecture'; lectureId: string };

/** Id of the main course when the root `course.yaml` has no `id`. */
export const DEFAULT_MAIN_COURSE_ID = 'agent';

/** One course. (Was the whole repository before multiple courses.) */
export interface ContentModel {
  id: string;
  title: string;
  /** `''` for the main course, `/<id>` for an additional course. */
  basePath: string;
  /** Navigation tree in authored order. */
  toc: TocNode[];
  /** All lectures in navigation order (depth-first over the toc). */
  lectures: Lecture[];
  /** This course's exercises. */
  exercises: Map<string, Exercise>;
}

/** All courses of the repository; `courses[0]` is the main course. */
export interface Catalog {
  courses: ContentModel[];
  /** Every exercise of every course (ids are unique across the repository). */
  exercises: Map<string, Exercise>;
}

export interface Lecture {
  id: string;
  courseId: string;
  /** The course's URL prefix (see `ContentModel.basePath`). */
  basePath: string;
  title: string;
  /** Readable without signing in (`public: true` in lecture.yaml), with its images. */
  public: boolean;
  /** Lecture directory relative to the repository root, e.g. `lectures/uvod` or `data/lectures/uvod`. */
  dir: string;
  /** Parts in authored order. */
  parts: Part[];
}

export interface Part {
  id: string;
  lectureId: string;
  title: string;
  /** 1-based position within the lecture ("Část 2 z 6"). */
  number: number;
  /** Markdown file relative to the repository root. */
  file: string;
  /** Full Markdown source including front matter; line numbers refer to it. */
  source: string;
  exercises: Exercise[];
  assets: AssetRef[];
}

export interface ExerciseField {
  id: string;
  label: string;
  guidance?: string;
}

export interface Exercise {
  id: string;
  revision: number;
  title?: string;
  fields: ExerciseField[];
  courseId: string;
  lectureId: string;
  partId: string;
}

export interface AssetRef {
  /** `image`: shown in the page; `file`: target of an ordinary link, downloaded. */
  kind: 'image' | 'file';
  /** URL exactly as written in the Markdown. */
  url: string;
  /** Resolved path relative to the repository root. */
  path: string;
  exists: boolean;
  line?: number;
}

export interface LoadResult {
  /** Present only when there are no errors (warnings are allowed). */
  model?: Catalog;
  issues: ValidationIssue[];
}
