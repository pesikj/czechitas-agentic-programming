# Second Course (Digitální akademie: Data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a second course from a subdirectory of the content repository. Learners can switch to it with `/course` (alias `/kurz`) or with a link on each course's title page. Answers stay separate and are grouped per course.

**Architecture:** The loader reads the root course and the additional courses listed in the root `course.yaml` into one `Catalog` (`courses[0]` is the main course). One publish run validates and stores the whole catalog in the existing snapshot tables. Pages get one course through `getCourseContent(courseId?)`. The main course keeps its routes at `/`. Additional courses are served from the same page views under `/<courseId>/…`. The current course is derived from the URL only.

**Tech Stack:** Astro 7 SSR, TypeScript, Drizzle + PostgreSQL, Vitest, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-10-30-second-course-design.md`

## Global Constraints

- The UI text is Czech; code, comments and docs are English. Match the existing comment density and idiom.
- Existing addresses `/lekce/<lecture>/<part>`, `/hledat`, `/obsah/<repository path>` and saved answers of the main course keep working unchanged.
- A repository with no `courses` key (the current content and every existing fixture) must load exactly as today.
- Lecture ids and exercise ids are unique across the whole repository. A duplicate is a validation error.
- One "Aktualizovat obsah" run publishes all courses. An error in any course fails the run and leaves the previous revision active.
- The current course comes from the URL only: no cookie, session or database state.
- No per-course access rules. Signed-out visitors see the title pages and the `public: true` lectures of every course.
- Keep these green after every task: `npm run check`, `npm test`. After Tasks 3–5, also `npm run test:e2e`.

## Review Focus

1. **An additional course directory named like a site route** (`lekce`, `admin`, `hledat`, `obsah`, …) or like the main course id must fail validation (`course-id-reserved`). Otherwise its pages could never be reached. Pinned in Task 2.
2. **A snapshot stored before this change** (`model` without `courses`) is still in the database after deploy. The first request must rebuild and *replace* it from its commit. Inserting it again would hit the primary key, be ignored as "another process stored it first", and leave the site rebuilding on every cold start. Pinned in Task 2.
3. **A lecture requested under the wrong course prefix** (`/lekce/<data-lecture>`, `/data/lekce/<main-lecture>`, `/agent/` for the main course id, `/neexistuje/`) must return 404. It must never render the lecture or redirect a visitor to sign-in for content that doesn't exist. Pinned in Task 3.
4. **`/course` with an unknown or ambiguous argument, or with only one course**, must answer with a message and suggestions, never throw. The same goes for Tab completion after `/course `. Pinned in Task 1.
5. **A Data exercise answered by a learner who also answered main-course exercises** must show each answer once, under its own course, in "Moje odpovědi" and in the exports. Pinned in Task 4.

---

### Task 1: `/course` command

**Files:**
- Modify: `src/lib/commands.ts`
- Test: `tests/commands.test.ts`

**Interfaces:**
- Produces (in `src/lib/commands.ts`):
  ```ts
  export interface CourseTarget {
    /** 1-based, in declaration order (main course first). */
    number: number;
    id: string;
    title: string;
    /** The course's title page: `/` for the main course, `/<id>/` otherwise. */
    href: string;
    /** URL prefix of the course's routes: `''` for the main course, `/<id>` otherwise. */
    basePath: string;
  }
  ```
  Every `CommandContext` variant gains `courses?: CourseTarget[]` and `currentCourse?: string` (a course id; absent means `courses[0]`). `CommandName` gains `'course'`.
- `/home` navigates to the current course's `href` (fallback `/`). `/search <q>` navigates to `${basePath}/hledat?q=…` (fallback `/hledat`).

- [ ] **Step 1: Write the failing tests** in `tests/commands.test.ts`, under a new `describe('/course')`. Use `courses = [{ number: 1, id: 'agent', title: 'Agentní programování', href: '/', basePath: '' }, { number: 2, id: 'data', title: 'Digitální akademie: Data', href: '/data/', basePath: '/data' }]` with `home` given `courses` and `currentCourse: 'agent'`:
  - `navigateTo('/course data')` → `'/data/'`; `'/kurz 2'` → `'/data/'`; `'/course 1'` → `'/'`; `'/course akademie'` → `'/data/'`.
  - `runCommand('/course', home)` → `kind: 'message'` with two suggestions: `{ label: '1 Agentní programování (aktuální)', command: '/course agent' }` and `{ label: '2 Digitální akademie: Data', command: '/course data' }`.
  - `runCommand('/course 3', home)` → message `'Kurz 3 neexistuje. K dispozici jsou 2 kurzy.'` with both suggestions.
  - `runCommand('/course xyz', home)` → message `'Žádný kurz neodpovídá výrazu „xyz“.'`.
  - Two courses whose titles both contain `kurz`: `runCommand('/course kurz', …)` → message `'Výrazu „kurz“ odpovídá více kurzů:'` listing both.
  - A context without `courses` (or with one course): `runCommand('/course data', ctx)` → message `'K dispozici je jen jeden kurz.'`, no throw.
  - With `currentCourse: 'data'`: `navigateTo('/home', ctx)` → `'/data/'`; `navigateTo('/search tabulka', ctx)` → `'/data/hledat?q=tabulka'`. Without `courses`, `/home` still gives `'/'` and `/search x` gives `'/hledat?q=x'` (existing tests stay as they are).
  - `completions('/course ', home)` returns `[{ value: '/course agent', label: '/course agent', description: 'Agentní programování' }, { value: '/course data', … }]`; `completions('/course d', home)` returns only the data entry; `completions('/kur', home)` includes `{ label: '/course', value: '/course ' }`.
  - `/help` output (`COMMANDS`) contains `course` with aliases `['kurz']`.

- [ ] **Step 2: Run** `npx vitest run tests/commands.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement** in `src/lib/commands.ts`:
  - Add the `COMMANDS` entry `{ name: 'course', aliases: ['kurz'], description: 'Přepnout na jiný kurz podle čísla, názvu nebo id', examples: ['/course data', '/course 1'] }` before `home`.
  - Generalise `matchLectures` into `matchByTitle<T extends { id: string; title: string }>(query: string, items: T[]): T[]` and use it for both lectures and courses.
  - Add `course(arg: string, context: CommandContext): CommandResult`, mirroring `open()`: an empty argument lists the courses, then try number, exact id, title words. Use `count(n, 'kurz', 'kurzy', 'kurzů')` for the "K dispozici jsou …" text.
  - In `completions`, complete after `/course ` from `context.courses`, matching by id prefix or title words.

- [ ] **Step 4: Run** `npx vitest run tests/commands.test.ts` and `npm run check`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Add /course command for switching courses"`.

---

### Task 2: Multi-course content catalog (loader, snapshot, provider)

After this task the site works exactly as before for the main course, and the catalog holds every course. The additional courses get no routes yet (Task 3).

**Files:**
- Modify: `src/lib/content/types.ts`, `src/lib/content/validate.ts`, `src/lib/content/load.ts`, `src/lib/content/index.ts` (exports), `src/lib/navigation.ts`, `src/lib/search.ts`, `src/lib/content/visibility.ts` (types only, routes come in Task 3), `src/server/content/snapshot-store.ts`, `src/server/content/provider.ts`, `src/server/responses.ts` (`saveResponse` lookup only), `scripts/validate-content.ts`, and every page or component that currently calls `getContent()` and uses `model` as one course: `src/pages/index.astro`, `src/pages/lekce/[lectureId]/index.astro`, `src/pages/lekce/[lectureId]/[partId].astro`, `src/pages/hledat.astro`, `src/pages/404.astro`, `src/pages/prihlaseni.astro`, `src/pages/moje-odpovedi/*`, `src/pages/admin/**`, `src/pages/odpovedi/[exerciseId].ts`, `src/components/AnswerCard.astro`, `src/components/NavTree.astro`
- Create fixtures: `fixtures/content/courses/` (copy of `fixtures/content/minimal` plus `courses: [data]` in `course.yaml` and `data/course.yaml` + `data/lectures/01-tabulky/{lecture.yaml,tabulky.md}` containing one `exercise` block and one image under `data/lectures/01-tabulky/images/`); invalid fixtures `fixtures/content/invalid/{course-id-reserved,course-dir-missing,cross-course-duplicate}/`
- Docs: `docs/content-contract.md` (layout with `data/`, root `id` and `courses`, cross-course uniqueness, new issue codes, "never reuse a published exercise id, in either course"), `docs/admin-guide.md` (one update publishes all courses)
- Test: `tests/content.test.ts`, `tests/navigation.test.ts`, `tests/provider.test.ts`, `tests/integration/publish.test.ts`

**Interfaces:**
- Consumes: `CourseTarget` from Task 1.
- Produces (`src/lib/content/types.ts`):
  ```ts
  /** One course. (Was the whole repository before multiple courses.) */
  export interface ContentModel {
    id: string;
    title: string;
    /** `''` for the main course, `/<id>` for an additional course. */
    basePath: string;
    toc: TocNode[];
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
  export interface LoadResult { model?: Catalog; issues: ValidationIssue[] }
  // Lecture gains `courseId: string; basePath: string`. Exercise gains `courseId: string`.
  // IssueCode gains 'course-id-reserved' | 'course-id-duplicate'.
  ```
  `export const DEFAULT_MAIN_COURSE_ID = 'agent';` (used when the root `course.yaml` has no `id`).
- `src/lib/navigation.ts`:
  - `partHref(lecture: Pick<Lecture, 'id' | 'basePath'>, partId: string): string`, giving `${basePath}/lekce/<id>/<part>`. Update all callers.
  - `courseHref(course: Pick<ContentModel, 'basePath'>): string`, giving `'/'` or `'/data/'`.
  - `searchHref(course: Pick<ContentModel, 'basePath'>, query?: string): string`.
  - `courseTargets(catalog: Catalog | undefined): CourseTarget[]`.
  - `homeContext(model, courses: CourseTarget[] = [])`, `partContext(model, lecture, part, courses: CourseTarget[] = [])`, `otherContext(model, courses: CourseTarget[] = [])`. Each sets `courses` and `currentCourse: model?.id`.
- `src/lib/search.ts`: `SearchDocument` gains `courseId: string`. `buildSearchIndex(model: ContentModel)` stays per course.
- `src/server/content/provider.ts`:
  - `getContent(): Promise<ContentState>`, now with `model?: Catalog`, for catalog-level users (save route, middleware, admin content page).
  - ```ts
    export interface CourseContent {
      state: ContentState['state'];
      issues: ValidationIssue[];
      revision?: { id: string; sha: string };
      catalog?: Catalog;
      /** The requested course; undefined if the content is empty/invalid or the id is unknown. */
      model?: ContentModel;
      courses: CourseTarget[];
    }
    /** One course of the current content; the main course when `courseId` is omitted. */
    export async function getCourseContent(courseId?: string): Promise<CourseContent>;
    export async function searchContent(query: string, courseId: string): Promise<SearchHit[]>;
    ```
  - Snapshot `search` holds the documents of all courses; `searchContent` filters by `courseId`.
- `src/server/content/snapshot-store.ts`: `StoredModel = { courses: Omit<ContentModel, 'exercises'>[] }`. `loadSnapshot` returns `undefined` when `row.model.courses` is not an array (old format). Add `deleteSnapshot(tx, revisionId): Promise<void>`.
- `saveResponse` input `model: ContentModel` becomes `catalog: Catalog`. It finds the lecture in `catalog.courses.find(c => c.id === exercise.courseId)`. `revisionNote(record, exercises: Map<string, Exercise> | undefined)` replaces the `model` parameter. `AnswerCard` gets `catalog?: Catalog` instead of `model`.

- [ ] **Step 1: Write failing loader tests** in `tests/content.test.ts`:
  - `describe('loadContent — courses fixture')` over `fixtures/content/courses`: no issues; `model!.courses.map(c => [c.id, c.title, c.basePath])` equals `[['agent', 'Testovací kurz', ''], ['data', <title from data/course.yaml>, '/data']]`; the data lecture's `dir` is `'data/lectures/01-tabulky'` and its `basePath` is `'/data'`; its image asset `path` starts with `'data/lectures/01-tabulky/images/'`; `model!.exercises` contains the exercises of both courses and each has the right `courseId`; `model!.courses[1].exercises` contains only the data course's exercises.
  - `minimal` fixture: `model!.courses` has length 1, id `'agent'`, `basePath ''`. Update the existing `model!.title` and `model!.lectures` assertions to `model!.courses[0]!.…`.
  - Invalid fixtures (extend the existing invalid-fixture table): `course-id-reserved` (`courses: [lekce]`) gives error `course-id-reserved` on `course.yaml`; `course-dir-missing` (`courses: [data]`, no `data/course.yaml`) gives `course-missing` on `data/course.yaml`; `cross-course-duplicate` (a data lecture reusing a main lecture id and a data exercise reusing a main exercise id) gives `lecture-id-duplicate` and `exercise-id-duplicate` with `file` under `data/`. `courses: [data, data]` gives `course-id-duplicate`. A `courses` or `id` key inside `data/course.yaml` gives `schema-invalid`.
  - Reserved ids: `RESERVED_COURSE_IDS` (exported from `validate.ts`) equals exactly `['404', '_astro', '_image', 'admin', 'health', 'hledat', 'lekce', 'moje-odpovedi', 'nahled-odpovedi', 'obnova-hesla', 'obsah', 'odhlaseni', 'odpovedi', 'prihlaseni', 'zapomenute-heslo', 'zmena-hesla']`. The main course id is also reserved for additional courses.

- [ ] **Step 2: Run** `npx vitest run tests/content.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the loader.**
  - `validate.ts`: `courseSchema` becomes `z.strictObject({ id: nonEmpty.optional(), title, courses: z.array(nonEmpty).optional(), toc })`. Add `additionalCourseSchema = z.strictObject({ title, toc })`.
  - `load.ts`: the `Loader` gets a `courseDir` (`''` or `'data'`). The `IssueCollector` and the `lectureIds` / `exercises` sets are shared across the courses, so duplicates are caught across the repository. `loadContent` loads the root course, checks each `courses` entry with `checkId` and the reserved and duplicate rules, then loads `<entry>/course.yaml` with `additionalCourseSchema`. The `lectures/` directory and every reported `file` are relative to the course directory but prefixed with it (`data/lectures/...`). Asset resolution and the `asset-outside-repo` check stay relative to the repository root. `reportUnlistedLectures` only scans the course's own `lectures/` directory.
  - Update `scripts/validate-content.ts` to print one `OK:` line per course.

- [ ] **Step 4: Run** `npx vitest run tests/content.test.ts`. Expected: PASS.

- [ ] **Step 5: Write failing navigation, provider and publish tests.**
  - `tests/navigation.test.ts`: `partHref({ id: 'tabulky', basePath: '/data' }, 'uvod')` gives `'/data/lekce/tabulky/uvod'`. `courseHref({ basePath: '' })` gives `'/'` and `courseHref({ basePath: '/data' })` gives `'/data/'`. `courseTargets(catalog)` matches the `CourseTarget` values from Task 1. `homeContext(dataCourse, targets)` has `currentCourse: 'data'`. Lecture numbers in `lectureTargets(dataCourse)` start at 1.
  - `tests/provider.test.ts` (preview mode over `fixtures/content/courses`): `getCourseContent()` returns the main course, `getCourseContent('data')` returns the data course, and `getCourseContent('neexistuje')` returns `model === undefined` with `state === 'ready'`. `searchContent(<word only in the data part>, 'data')` has one hit whose `href` starts with `/data/lekce/`, and the same query with `'agent'` has none. `resolveAsset('data/lectures/01-tabulky/images/…')` returns the image.
  - `tests/integration/publish.test.ts`: add `courses: [data]` and a `data/` course to the test repository and publish. Assert `getCourseContent('data')` is ready and `storedAssets` includes the data image. Then break `data/course.yaml`: publishing returns `status: 'failed'` and the previous revision stays active.
  - **Review Focus 2:** in `publish.test.ts`, overwrite the active snapshot's `model` with the old single-course shape `{ title, toc, lectures }` via `getDb().update(contentSnapshots)`, then `forgetSnapshot()`. `getCourseContent('data')` must return the data course, and the row's `model.courses` must now be an array (rebuilt and replaced, not re-inserted).

- [ ] **Step 6: Run** `npx vitest run tests/navigation.test.ts tests/provider.test.ts` and `npm test`. Expected: FAIL.

- [ ] **Step 7: Implement navigation, search, snapshot store and provider** as in Interfaces. `buildSnapshot` iterates `model.courses` for assets and rendering (`rendered` stays keyed by `lectureId/partId`). `search` concatenates `buildSearchIndex(course)` per course. In `rebuildSnapshot`, call `deleteSnapshot` for the revision inside the same transaction as `saveSnapshot` when an old-format row exists. `getCourseContent` maps `courseId ?? catalog.courses[0].id` onto the catalog and builds `courses` with `courseTargets`.

- [ ] **Step 8: Update the consumers mechanically to the main course.**
  - Course pages use `getCourseContent()` and pass `content.courses` into the context builders.
  - The save route `odpovedi/[exerciseId].ts` uses `getContent()` and `catalog.exercises`.
  - `AnswerCard` and `revisionNote` use `catalog.exercises`, and `AnswerCard` links with `partHref(lecture, partId)`, finding the lecture in the catalog.
  - `prihlaseni.astro` keeps listing the main course's public lectures only.
  - The admin content page shows the course titles from the catalog.
  - `isPublicContentPath(catalog, path)` checks only the main course for now.

- [ ] **Step 9: Update `docs/content-contract.md` and `docs/admin-guide.md`.** Run `npm run check`, `npm test`, `npm run test:e2e`. Expected: all PASS, e2e unchanged.

- [ ] **Step 10: Commit** `git commit -m "Load all courses of the content repository into one catalog"`.

---

### Task 3: Course routes, switching links and access

**Files:**
- Create: `src/views/HomeView.astro`, `src/views/PartView.astro`, `src/views/SearchView.astro` (moved from the bodies of `src/pages/index.astro`, `src/pages/lekce/[lectureId]/[partId].astro`, `src/pages/hledat.astro`; each takes `courseId?: string`)
- Create: `src/pages/[course]/index.astro`, `src/pages/[course]/hledat.astro`, `src/pages/[course]/lekce/[lectureId]/index.astro`, `src/pages/[course]/lekce/[lectureId]/[partId].astro`
- Modify: the three original pages (now thin wrappers rendering the views with no `courseId`), `src/pages/lekce/[lectureId]/index.astro`, `src/layouts/CourseLayout.astro` (brand link goes to `courseHref(model)` instead of `/`), `src/middleware.ts`, `src/lib/content/visibility.ts`
- Fixture: `fixtures/content/e2e/` gets `courses: [data]` in `course.yaml` and `data/course.yaml` (title `Digitální akademie: Data`) with lecture `01-tabulky` (`public: true`, two parts) and lecture `02-grafy` (not public, one part with an `exercise` block)
- Docs: `README.md` (layout section: `src/views/`, courses)
- Test: `tests/visibility.test.ts` (create), `tests/e2e/courses.spec.ts` (create)

**Interfaces:**
- Consumes: `getCourseContent`, `courseHref`, `searchHref`, `partHref`, `courseTargets`, context builders (Task 2); `/course` (Task 1).
- `[course]` pages: if `Astro.params.course` is the main course id or unknown (`getCourseContent(id).model === undefined` while `state === 'ready'`), `return Astro.rewrite('/404')`.
- `isPublicContentPath(catalog: Catalog, pathname: string): boolean` recognises:
  - `/lekce/<l>[/<p>]` when `l` is a public lecture of `courses[0]`;
  - `/<id>/lekce/<l>[/<p>]` when `<id>` is an additional course and `l` is a public lecture of that course;
  - `/obsah/<path>` used by a public lecture of any course.
- Middleware `isPublicContent()`: `/` and an additional course's title page (`/<id>` and `/<id>/`) are public. Lecture and asset paths are delegated to `isPublicContentPath`.
- Title page copy (`HomeView`), shown to every visitor below the intro, once per other course: `<p class="intro">Další kurz: <a href={course.href}>{course.title}</a> (nebo příkazem <code>/course {course.id}</code>).</p>`

- [ ] **Step 1: Write failing unit tests** in `tests/visibility.test.ts` for `isPublicContentPath`, with a catalog whose main course has public `uvod` and private `prompty`, and whose data course has public `tabulky` and private `grafy`:
  - `/lekce/uvod/x` → true; `/data/lekce/tabulky/x` → true; `/data/lekce/grafy/x` → false.
  - **Review Focus 3:** `/lekce/tabulky/x` → false; `/data/lekce/uvod/x` → false; `/agent/lekce/uvod/x` → false; `/neexistuje/lekce/uvod/x` → false.
  - `/obsah/data/lectures/01-tabulky/images/a.png` → true when referenced by `tabulky`.

- [ ] **Step 2: Write the failing e2e spec** `tests/e2e/courses.spec.ts`, in the style of `navigation.spec.ts` (signed-in storage state, axe check on each new page):
  - On `/`, the link `Digitální akademie: Data` leads to `/data/`, which shows the heading `Digitální akademie: Data`, its lecture list and a link back to the main course.
  - In the command bar: `/course data` goes to `/data/`; `/open 1` goes to `/data/lekce/<tabulky-id>/<first part>`; `/next` goes to the second part; `/home` goes to `/data/`; `/search` with a word only in the data course has one hit; `/course 1` goes to `/`.
  - Saving an answer in `02-grafy` works and shows "Uloženo".
  - **Review Focus 3:** `GET /lekce/<tabulky-id>/<part>`, `/data/lekce/<main lecture id>/<part>`, `/agent/` and `/neexistuje/` return 404 when signed in.
  - Signed out (new context): `/data/` is reachable and lists only `01-tabulky`; `/data/lekce/<tabulky>/<part>` is readable; `/data/lekce/<grafy>/<part>` redirects to `/prihlaseni?next=…`.
  - Mobile WebKit project: `/data/` passes axe and has no horizontal scroll (reuse the existing layout helper).

- [ ] **Step 3: Run** `npx vitest run tests/visibility.test.ts` and `npx playwright test tests/e2e/courses.spec.ts`. Expected: FAIL.

- [ ] **Step 4: Implement** the views, the `[course]` routes, `isPublicContentPath`, the middleware change, the `CourseLayout` brand link and the title-page links as in Interfaces. Move the page bodies unchanged apart from `getCourseContent(courseId)` and `searchHref`/`courseHref`. Update `README.md`.

- [ ] **Step 5: Run** `npm run check`, `npm test`, `npm run test:e2e`. Expected: PASS, including all existing e2e specs (the main course's addresses are unchanged).

- [ ] **Step 6: Commit** `git commit -m "Serve additional courses under their own prefix with switching links"`.

---

### Task 4: Answers grouped and filtered by course

**Files:**
- Modify: `src/server/db/schema.ts`, `src/server/responses.ts`, `src/lib/export.ts`, `src/pages/moje-odpovedi/index.astro`, `src/pages/moje-odpovedi/export.md.ts`, `src/pages/admin/odpovedi/index.astro`, `src/pages/admin/odpovedi/export.md.ts`
- Create: migration `drizzle/0001_*.sql` via `npm run db:generate`
- Docs: `docs/data-model.md` (`responses.course_id`, required)
- Test: `tests/integration/responses.test.ts`, `tests/export.test.ts`, `tests/e2e/responses.spec.ts`

**Interfaces:**
- Consumes: `Catalog`, `Exercise.courseId`, `saveResponse({ catalog, … })` (Task 2).
- `responses.courseId: text('course_id').notNull()`. The existing rows are test data only (product owner, 30 October 2026). The migration fills them with `'agent'` so it applies on a non-empty table, then drops the default. No code treats legacy rows specially.
- `saveResponse` stores `courseId: exercise.courseId`.
- `listResponses(filter: { userId?: string; exerciseId?: string; courseId?: string })`.
- `groupByCourse<T extends { courseId: string }>(records: T[], catalog: Catalog | undefined): { courseId: string; title: string; records: T[] }[]` in `src/server/responses.ts`. Groups follow catalog order, and unknown ids come last with the id as title. Empty groups are omitted.
- `ExportRecord` gains `courseTitle?: string | null`. When the records carry more than one distinct `courseTitle`, `responsesToMarkdown` emits `## <courseTitle>` per group and demotes record headings to `###` and field headings to `####`. Otherwise the output is unchanged.
- Admin filter query parameter: `kurz=<course id>`, also passed to the export link.

- [ ] **Step 1: Write failing tests.**
  - `tests/integration/responses.test.ts`: saving a data exercise stores `courseId === 'data'`, and a main exercise stores `'agent'`. `listResponses({ courseId: 'data' })` returns only data answers. **Review Focus 5:** for one learner with answers in both courses, `groupByCourse` returns the `agent` group, then the `data` group, each containing only its own answers.
  - `tests/export.test.ts`: two records with `courseTitle` `'A'` and `'B'` produce `## A` and `## B` and `### ` record headings. Records with one course title produce exactly today's output (existing snapshot assertions unchanged).
  - `tests/e2e/responses.spec.ts`: after saving one answer in each course, "Moje odpovědi" shows two `h2` group headings in catalog order. In admin "Odpovědi", choosing course `Digitální akademie: Data` shows only the data answer.

- [ ] **Step 2: Run** `npm test` and `npx playwright test tests/e2e/responses.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Add the column and run `npm run db:generate` (commit the generated SQL and meta). Then implement the functions above. In "Moje odpovědi", render a group `<h2>` per course with the `AnswerCard`s at `headingLevel={3}`. Add the course `<select name="kurz">` (with an "all courses" option, `Všechny kurzy`) before the existing filters in admin "Odpovědi". Exports pass `courseTitle` from `groupByCourse` and apply the same filter. Update `docs/data-model.md`.

- [ ] **Step 4: Run** `npm run db:migrate`, `npm run check`, `npm test`, `npm run test:e2e`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Group and filter saved answers by course"`.

---

### Task 5: Final verification against the spec's acceptance list

**Files:** none expected; fix only what the walk-through finds.

- [ ] **Step 1:** Run `npm run content:validate -- fixtures/content/e2e`. Expected: two `OK:` lines (main and data).
- [ ] **Step 2:** Start `npm run dev` with `CONTENT_DIR=fixtures/content/e2e`. Walk the spec's "Acceptance" list by hand: links both ways, `/course data` → `/data/`, `/open 1` inside Data, saving an answer, `/course agent` → `/`, and a signed-out visitor seeing only public lectures.
- [ ] **Step 3:** Run `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`. Expected: all PASS.
- [ ] **Step 4:** Commit any fixes with a message that names what the walk-through found.
