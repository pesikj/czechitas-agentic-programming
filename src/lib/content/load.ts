// Loads and validates a content repository checkout into a Catalog of courses.
// See docs/content-contract.md for the format.
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Definition, Nodes, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { z } from 'zod';
import { ALTERNATIVES_DIRECTIVE, EXERCISE_LANG, OPTION_DIRECTIVE, parseMarkdown } from './markdown';
import {
  DEFAULT_MAIN_COURSE_ID,
  type AssetRef,
  type ContentModel,
  type Exercise,
  type Lecture,
  type LoadResult,
  type Part,
  type TocNode,
} from './types';
import {
  FILE_EXTENSIONS,
  IMAGE_EXTENSIONS,
  IssueCollector,
  RESERVED_COURSE_IDS,
  additionalCourseSchema,
  checkId,
  checkSchema,
  courseSchema,
  exerciseSchema,
  lectureSchema,
  parseYamlWithLines,
  partFrontMatterSchema,
  type TocEntryInput,
} from './validate';

const COURSE_FILE = 'course.yaml';
const LECTURES_DIR = 'lectures';
const LECTURE_FILE = 'lecture.yaml';

/**
 * Loads the repository at `rootDir`: the main course at the root and the additional courses
 * declared in its `courses`. The catalog is returned only if there are no errors.
 */
export async function loadContent(rootDir: string): Promise<LoadResult> {
  const shared: Shared = { issues: new IssueCollector(), lectureIds: new Set(), exercises: new Map() };
  const root = await realpath(rootDir);
  const courses = await loadCourses(root, shared);
  const issues = shared.issues.issues;
  return shared.issues.hasErrors || !courses ? { issues } : { model: { courses, exercises: shared.exercises }, issues };
}

async function loadCourses(root: string, shared: Shared): Promise<ContentModel[] | undefined> {
  const main = new Loader(root, '', shared);
  const parsed = await main.readCourse(courseSchema);
  if (!parsed) return undefined;
  const { data, lineOf } = parsed;
  const mainId = data.id ?? DEFAULT_MAIN_COURSE_ID;
  if (data.id !== undefined) checkId(data.id, 'Course', COURSE_FILE, shared.issues, lineOf(['id']));
  const courses = [await main.loadCourse(mainId, data, lineOf)];

  const declared = new Set<string>();
  for (const [index, id] of (data.courses ?? []).entries()) {
    const line = lineOf(['courses', index]);
    if (!checkId(id, 'Course', COURSE_FILE, shared.issues, line)) continue;
    if (RESERVED_COURSE_IDS.includes(id) || id === mainId) {
      shared.issues.error(
        'course-id-reserved',
        COURSE_FILE,
        `Course id "${id}" is reserved (a site address or the main course id); choose another name.`,
        line,
      );
      continue;
    }
    if (declared.has(id)) {
      shared.issues.error('course-id-duplicate', COURSE_FILE, `Course "${id}" is listed more than once.`, line);
      continue;
    }
    declared.add(id);
    const loader = new Loader(root, id, shared);
    const additional = await loader.readCourse(additionalCourseSchema);
    if (additional) courses.push(await loader.loadCourse(id, additional.data, additional.lineOf));
  }
  return courses;
}

/** State shared by the courses, so ids are unique across the whole repository. */
interface Shared {
  issues: IssueCollector;
  lectureIds: Set<string>;
  /** Every exercise of every course. */
  exercises: Map<string, Exercise>;
}

type LineOf = (path: readonly PropertyKey[]) => number | undefined;

const isExternal = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');
const stripQuery = (url: string) => url.replace(/[?#].*$/, '');

/**
 * A link to a downloadable repository file: relative, with a supported extension. Other links
 * (websites, site routes like `/hledat`, anchors, other pages) are left as written.
 */
function isFileLink(url: string): boolean {
  if (isExternal(url) || url.startsWith('/') || url.startsWith('#')) return false;
  return FILE_EXTENSIONS.has(path.posix.extname(stripQuery(url)).toLowerCase());
}

/** Authored lecture numbers are shown without leading zeros: `01 – Úvod` becomes `1 – Úvod`. */
function lectureTitle(title: string): string {
  return title.replace(/^0+(?=\d)/, '');
}

/** Loads one course from its directory (`''` for the repository root). */
class Loader {
  private readonly issues: IssueCollector;
  private readonly lectures: Lecture[] = [];
  private readonly listedLectureDirs = new Set<string>();
  /** This course's exercises. */
  private readonly exercises = new Map<string, Exercise>();
  private readonly courseFile: string;
  private readonly lecturesDir: string;
  private courseId = '';
  private basePath = '';

  constructor(
    private readonly root: string,
    private readonly courseDir: string,
    private readonly shared: Shared,
  ) {
    this.issues = shared.issues;
    this.courseFile = this.inCourse(COURSE_FILE);
    this.lecturesDir = this.inCourse(LECTURES_DIR);
  }

  /** A path inside the course directory, relative to the repository root. */
  private inCourse(relative: string): string {
    return this.courseDir ? `${this.courseDir}/${relative}` : relative;
  }

  async readCourse<T>(schema: z.ZodType<T>): Promise<{ data: T; lineOf: LineOf } | undefined> {
    const source = await this.readText(this.courseFile);
    if (source === undefined) {
      const where = this.courseDir ? `The course directory ${this.courseDir}/` : 'The repository root';
      this.issues.error('course-missing', this.courseFile, `${where} must contain ${COURSE_FILE}.`);
      return undefined;
    }
    const parsed = parseYamlWithLines(source, this.courseFile, this.issues, 'yaml-invalid');
    if (!parsed) return undefined;
    const data = checkSchema(schema, parsed, this.courseFile, this.issues, 'schema-invalid');
    return data ? { data, lineOf: parsed.lineOf } : undefined;
  }

  async loadCourse(id: string, course: { title: string; toc: TocEntryInput[] }, lineOf: LineOf): Promise<ContentModel> {
    this.courseId = id;
    this.basePath = this.courseDir ? `/${id}` : '';
    const toc = await this.loadToc(course.toc, ['toc'], lineOf);
    await this.reportUnlistedLectures();
    return { id, title: course.title, basePath: this.basePath, toc, lectures: this.lectures, exercises: this.exercises };
  }

  private async loadToc(
    entries: TocEntryInput[],
    yamlPath: PropertyKey[],
    lineOf: LineOf,
  ): Promise<TocNode[]> {
    const nodes: TocNode[] = [];
    for (const [index, entry] of entries.entries()) {
      const entryPath = [...yamlPath, index];
      if ('lecture' in entry) {
        const lecture = await this.loadLecture(entry.lecture, lineOf([...entryPath, 'lecture']));
        if (lecture) nodes.push({ kind: 'lecture', lectureId: lecture.id });
      } else {
        const children = await this.loadToc(entry.items, [...entryPath, 'items'], lineOf);
        nodes.push({ kind: 'group', title: entry.title, children });
      }
    }
    return nodes;
  }

  private async loadLecture(dirName: string, line: number | undefined): Promise<Lecture | undefined> {
    if (dirName.includes('/') || dirName.includes('\\') || dirName === '.' || dirName === '..') {
      this.issues.error(
        'lecture-missing',
        this.courseFile,
        `"${dirName}" must be the name of a directory directly inside ${this.lecturesDir}/.`,
        line,
      );
      return undefined;
    }
    this.listedLectureDirs.add(dirName);
    const dir = `${this.lecturesDir}/${dirName}`;
    const file = `${dir}/${LECTURE_FILE}`;
    const source = await this.readText(file);
    if (source === undefined) {
      this.issues.error('lecture-missing', this.courseFile, `Lecture "${dirName}" has no ${file}.`, line);
      return undefined;
    }
    const parsed = parseYamlWithLines(source, file, this.issues, 'yaml-invalid');
    if (!parsed) return undefined;
    const data = checkSchema(lectureSchema, parsed, file, this.issues, 'schema-invalid');
    if (!data) return undefined;

    const idLine = parsed.lineOf(['id']);
    checkId(data.id, 'Lecture', file, this.issues, idLine);
    if (this.shared.lectureIds.has(data.id)) {
      this.issues.error(
        'lecture-id-duplicate',
        file,
        `Lecture id "${data.id}" is used by another lecture (in this or another course).`,
        idLine,
      );
    }
    this.shared.lectureIds.add(data.id);

    const lecture: Lecture = {
      id: data.id,
      courseId: this.courseId,
      basePath: this.basePath,
      title: lectureTitle(data.title),
      public: data.public === true,
      dir,
      parts: [],
    };
    const partIds = new Set<string>();
    for (const [index, partFile] of data.parts.entries()) {
      const partLine = parsed.lineOf(['parts', index]);
      const loaded = await this.loadPart(lecture, partFile, file, partLine);
      if (!loaded) continue;
      const { part, idLine: partIdLine } = loaded;
      if (partIds.has(part.id)) {
        this.issues.error(
          'part-id-duplicate',
          part.file,
          `Part id "${part.id}" is already used in lecture "${lecture.id}".`,
          partIdLine,
        );
      }
      partIds.add(part.id);
      lecture.parts.push({ ...part, number: lecture.parts.length + 1 });
    }

    await this.reportUnlistedParts(dir, data.parts);
    this.lectures.push(lecture);
    return lecture;
  }

  private async loadPart(
    lecture: Lecture,
    partFile: string,
    lectureFile: string,
    line: number | undefined,
  ): Promise<{ part: Part; idLine?: number } | undefined> {
    const file = path.posix.normalize(`${lecture.dir}/${partFile}`);
    if (!partFile.endsWith('.md') || path.isAbsolute(partFile) || !file.startsWith(`${lecture.dir}/`)) {
      this.issues.error(
        'part-path-invalid',
        lectureFile,
        `Part "${partFile}" must be a .md file inside the lecture directory.`,
        line,
      );
      return undefined;
    }
    const source = await this.readText(file);
    if (source === undefined) {
      this.issues.error('part-missing', lectureFile, `Part file "${partFile}" does not exist.`, line);
      return undefined;
    }

    const tree = parseMarkdown(source, 'content');
    const frontMatter = tree.children[0];
    if (frontMatter?.type !== 'yaml') {
      this.issues.error('schema-invalid', file, 'The part must start with front matter containing id and title.', 1);
      return undefined;
    }
    const baseLine = frontMatter.position?.start.line ?? 1;
    const parsed = parseYamlWithLines(frontMatter.value, file, this.issues, 'yaml-invalid', baseLine);
    if (!parsed) return undefined;
    const data = checkSchema(partFrontMatterSchema, parsed, file, this.issues, 'schema-invalid');
    if (!data) return undefined;
    const idLine = parsed.lineOf(['id']);
    checkId(data.id, 'Part', file, this.issues, idLine);

    const exercises = this.collectExercises(tree, file, lecture.id, data.id);
    const assets = await this.collectAssets(tree, file);
    this.checkDirectivesAndHtml(tree, file);

    const part: Part = { id: data.id, lectureId: lecture.id, title: data.title, number: 0, file, source, exercises, assets };
    return { part, ...(idLine !== undefined ? { idLine } : {}) };
  }

  private collectExercises(tree: Root, file: string, lectureId: string, partId: string): Exercise[] {
    const exercises: Exercise[] = [];
    visit(tree, 'code', (node) => {
      if (node.lang !== EXERCISE_LANG) return;
      const baseLine = node.position?.start.line ?? 0;
      const parsed = parseYamlWithLines(node.value, file, this.issues, 'exercise-invalid', baseLine);
      if (!parsed) return;
      const data = checkSchema(exerciseSchema, parsed, file, this.issues, 'exercise-invalid');
      if (!data) return;

      const idLine = parsed.lineOf(['id']);
      checkId(data.id, 'Exercise', file, this.issues, idLine);
      if (this.shared.exercises.has(data.id)) {
        this.issues.error(
          'exercise-id-duplicate',
          file,
          `Exercise id "${data.id}" is already used in another part; exercise ids must be unique in the whole repository (all courses).`,
          idLine,
        );
        return;
      }
      const fieldIds = new Set<string>();
      for (const [index, field] of data.fields.entries()) {
        const fieldLine = parsed.lineOf(['fields', index, 'id']);
        checkId(field.id, 'Field', file, this.issues, fieldLine);
        if (fieldIds.has(field.id)) {
          this.issues.error('field-id-duplicate', file, `Field id "${field.id}" is repeated in this exercise.`, fieldLine);
        }
        fieldIds.add(field.id);
      }
      const exercise: Exercise = { ...data, courseId: this.courseId, lectureId, partId };
      this.shared.exercises.set(exercise.id, exercise);
      this.exercises.set(exercise.id, exercise);
      exercises.push(exercise);
    });
    return exercises;
  }

  private async collectAssets(tree: Root, file: string): Promise<AssetRef[]> {
    const definitions = new Map<string, Definition>();
    visit(tree, 'definition', (node) => {
      definitions.set(node.identifier, node);
    });

    const refs: { kind: AssetRef['kind']; url: string; alt?: string | null; line?: number }[] = [];
    visit(tree, (node: Nodes) => {
      const line = node.position?.start.line;
      if (node.type === 'image') {
        refs.push({ kind: 'image', url: node.url, alt: node.alt, line });
      } else if (node.type === 'imageReference') {
        const definition = definitions.get(node.identifier);
        if (definition) refs.push({ kind: 'image', url: definition.url, alt: node.alt, line });
      } else if (node.type === 'link' || node.type === 'linkReference') {
        const url = node.type === 'link' ? node.url : definitions.get(node.identifier)?.url;
        if (url !== undefined && isFileLink(url)) refs.push({ kind: 'file', url, line });
      }
    });

    const assets: AssetRef[] = [];
    for (const ref of refs) {
      if (ref.kind === 'image' && !ref.alt?.trim()) {
        this.issues.warning('image-alt-missing', file, `Image "${ref.url}" has no alternative text.`, ref.line);
      }
      const asset = await this.resolveAsset(ref.kind, ref.url, file, ref.line);
      if (asset) assets.push(asset);
    }
    return assets;
  }

  private async resolveAsset(
    kind: AssetRef['kind'],
    url: string,
    file: string,
    line: number | undefined,
  ): Promise<AssetRef | undefined> {
    const noun = kind === 'image' ? 'Image' : 'File';
    if (isExternal(url)) {
      this.issues.warning(
        'asset-external',
        file,
        `External image "${url}" is not shown (the site only loads its own images, protected by sign-in); store it in the repository.`,
        line,
      );
      return undefined;
    }
    let relative: string;
    try {
      relative = decodeURIComponent(stripQuery(url));
    } catch {
      this.issues.error('asset-path-invalid', file, `${noun} path "${url}" is not a valid URL path.`, line);
      return undefined;
    }
    if (relative === '' || relative.startsWith('/')) {
      this.issues.error(
        'asset-path-invalid',
        file,
        `${noun} path "${url}" must be relative to the Markdown file (e.g. "${kind === 'image' ? 'images/screen.png' : 'data/table.csv'}").`,
        line,
      );
      return undefined;
    }

    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), relative));
    if (resolved.startsWith('../') || resolved === '..') {
      this.issues.error('asset-outside-repo', file, `${noun} "${url}" points outside the content repository.`, line);
      return undefined;
    }
    if (kind === 'image' && !IMAGE_EXTENSIONS.has(path.posix.extname(resolved).toLowerCase())) {
      this.issues.error(
        'asset-type-unsupported',
        file,
        `Image "${url}" must be one of: ${[...IMAGE_EXTENSIONS].join(', ')}.`,
        line,
      );
      return undefined;
    }

    const exists = await this.fileExistsExactCase(resolved);
    if (exists && !(await this.isInsideRoot(resolved))) {
      this.issues.error('asset-outside-repo', file, `${noun} "${url}" is a link to a file outside the repository.`, line);
      return undefined;
    }
    if (!exists) {
      this.issues.warning(
        'asset-missing',
        file,
        `${noun} "${url}" was not found at "${resolved}" (paths are case-sensitive). The part will show a placeholder.`,
        line,
      );
    }
    return { kind, url, path: resolved, exists, ...(line !== undefined ? { line } : {}) };
  }

  private checkDirectivesAndHtml(tree: Root, file: string): void {
    visit(tree, (node: Nodes, _index, parent) => {
      const line = node.position?.start.line;
      if (node.type === 'html') {
        this.issues.warning('raw-html-ignored', file, 'Raw HTML is not rendered; use Markdown instead.', line);
        return;
      }
      if (node.type === 'containerDirective' && node.name === ALTERNATIVES_DIRECTIVE) {
        const options = node.children.filter(
          (child) => child.type === 'containerDirective' && child.name === OPTION_DIRECTIVE,
        );
        if (options.length < 2 || options.length !== node.children.length) {
          this.issues.error(
            'alternatives-invalid',
            file,
            `::::${ALTERNATIVES_DIRECTIVE} must contain only :::${OPTION_DIRECTIVE}{label="…"} blocks, at least two.`,
            line,
          );
        }
        for (const option of options) {
          if (option.type === 'containerDirective' && !option.attributes?.label?.trim()) {
            this.issues.error(
              'alternatives-invalid',
              file,
              `:::${OPTION_DIRECTIVE} needs a label, e.g. :::${OPTION_DIRECTIVE}{label="macOS"}.`,
              option.position?.start.line,
            );
          }
        }
        return;
      }
      if (
        node.type === 'containerDirective' &&
        node.name === OPTION_DIRECTIVE &&
        parent?.type === 'containerDirective' &&
        parent.name === ALTERNATIVES_DIRECTIVE
      ) {
        return;
      }
      if (node.type === 'containerDirective' || node.type === 'leafDirective') {
        this.issues.warning(
          'directive-unknown',
          file,
          `Unknown directive "${node.name}" is shown as plain text.`,
          line,
        );
      }
    });
  }

  private async reportUnlistedParts(dir: string, listed: string[]): Promise<void> {
    const listedFiles = new Set(listed.map((partFile) => path.posix.normalize(`${dir}/${partFile}`)));
    for (const entry of await this.readDir(dir)) {
      const file = `${dir}/${entry}`;
      if (entry.endsWith('.md') && !listedFiles.has(file)) {
        this.issues.warning('part-unlisted', file, `This file is not listed in ${dir}/${LECTURE_FILE} and will not be shown.`);
      }
    }
  }

  private async reportUnlistedLectures(): Promise<void> {
    for (const entry of await this.readDir(this.lecturesDir)) {
      const stats = await stat(path.join(this.root, this.lecturesDir, entry)).catch(() => undefined);
      if (stats?.isDirectory() && !this.listedLectureDirs.has(entry)) {
        this.issues.warning(
          'lecture-unlisted',
          `${this.lecturesDir}/${entry}`,
          `This lecture directory is not listed in ${this.courseFile} and will not be shown.`,
        );
      }
    }
  }

  private async readText(relative: string): Promise<string | undefined> {
    if (!(await this.fileExistsExactCase(relative)) || !(await this.isInsideRoot(relative))) return undefined;
    return readFile(path.join(this.root, relative), 'utf8');
  }

  private async readDir(relative: string): Promise<string[]> {
    return readdir(path.join(this.root, relative)).catch(() => []);
  }

  /** Case-sensitive existence check, so content validated on macOS behaves the same on Linux. */
  private async fileExistsExactCase(relative: string): Promise<boolean> {
    let current = this.root;
    for (const segment of relative.split('/')) {
      if (!(await readdir(current).catch(() => [] as string[])).includes(segment)) return false;
      current = path.join(current, segment);
    }
    const stats = await stat(current).catch(() => undefined);
    return stats?.isFile() ?? false;
  }

  private async isInsideRoot(relative: string): Promise<boolean> {
    const real = await realpath(path.join(this.root, relative));
    return real.startsWith(this.root + path.sep);
  }
}
