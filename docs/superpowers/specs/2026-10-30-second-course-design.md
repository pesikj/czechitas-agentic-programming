# Second course: Digitální akademie: Data — design

Date: 30 October 2026 · Status: draft for approval

## Intent

The site currently serves one course (agentic programming). A second course, **Digitální akademie: Data**, is being added. It is written and maintained by the same people, and learners should be able to read it with the same terminal-style interface. A learner opening the site stays in the agentic programming course unless they choose to go to the Data course. They switch with a command in the command bar or by clicking a link on the title page.

## Goals

- A second course with its own lecture list, lecture pages, exercises and search. It works exactly like the current course.
- Switching between the courses with a command in the command bar and with a link on each course's title page.
- No per-course access rules. Every signed-in learner can read both courses and fill in every exercise. Lectures marked `public: true` work the same way in both courses for visitors who aren't signed in.
- Existing addresses, saved answers and content of the agentic course keep working unchanged.

## Non-goals

- Per-course permissions, enrolment or user restrictions.
- Publishing the courses separately.
- Remembering a learner's last course across visits.
- A general course catalogue or more than two courses. The structure should not prevent a third course, but no UI or work is spent on it now.

## Anti-goals (failure even if it "works")

- Breaking existing links (`/lekce/...`, `/obsah/...`) or detaching learners' saved answers from the agentic course.
- An answer saved in one course overwriting an answer in the other.
- A learner being unsure which course they are in.

## Decisions

### Content: one repository, Data course in a subdirectory (decided by the product owner)

Both courses live in the existing content repository (`CONTENT_REPO_URL`, same branch and token):

```
course.yaml          # agentic course, unchanged location
lectures/…
data/
  course.yaml        # Data course, same format as the root course.yaml
  lectures/…
```

- The agentic course stays at the repository root and doesn't move.
- Each course directory follows `docs/content-contract.md` relative to that directory. Asset paths stay **repository-relative** (e.g. `data/lectures/01-uvod/images/x.png`), so the asset route `/obsah/<path>` works unchanged.
- **Builder's call (proposed):** the root `course.yaml` declares the additional courses explicitly, for example:

  ```yaml
  id: agent            # short course id used in URLs and the /course command
  title: Agentní programování s Codex CLI a Claude Code
  courses:             # additional courses, in subdirectories
    - data
  toc: …
  ```

  and `data/course.yaml` has `id: data`. Declaring courses explicitly (rather than detecting any subdirectory that contains `course.yaml`) makes the validator's behaviour predictable. The exact key names are up to the builder. The content contract document must be updated.
- **Lecture ids and exercise ids must be unique across the whole repository** (both courses). The validator reports a duplicate as an error. As a result:
  - the `responses` primary key `(user_id, exercise_id)` stays as it is, and answers can't collide;
  - a lecture id identifies its course on its own.
- **Reusing the id of a removed exercise is not detected (decided by the designer).** If an agentic exercise is deleted and a Data exercise later reuses its id, learners' old answers would attach to the new exercise. Validation stays a pure check of the current content and doesn't query `responses`. The content contract already says "Do not change an id once published". It gets one more sentence: never reuse an exercise id that was published before, in either course.

### Publishing: together, all or nothing (decided by the product owner)

- A single **Aktualizovat obsah** run fetches the repository, validates **both** courses and publishes them in one revision. If either course has an error, nothing is published and the previous revision stays active. This is accepted because the same people maintain both courses.
- `content_revisions`, its one-active / one-in-progress indexes, and `content_assets` stay as they are. The `content_snapshots.model` JSON holds both courses. `rendered` stays keyed by `lectureId/partId`, which is enough because lecture ids are unique.
- The admin content page reports issues with file paths that already show which course they come from (`data/...`).
- Preview mode (`CONTENT_DIR`) shows both courses.

### Addresses

- Agentic course: unchanged — `/` (lecture list), `/lekce/<lecture>/<part>`, `/hledat`.
- Data course: under the course id prefix — `/data/` (lecture list), `/data/lekce/<lecture>/<part>`, `/data/hledat`.
- Assets: unchanged `/obsah/<repository path>` for both.
- A Data lecture requested under the agentic prefix (or the reverse) is a 404, or a redirect to its correct address (builder's call).
- The access middleware and `isPublicContentPath` must recognise the `/data/...` routes. The rules stay the same: the title page is always public, public lectures and their assets are readable without signing in, and everything else requires sign-in.

### Which course is "current"

- The current course comes **from the address only**. Nothing is stored in the session, a cookie or the database.
- Opening the site (`/`) always shows the agentic course. A link or bookmark to a Data page opens the Data page.
- Pages that aren't tied to a course (sign-in, password pages, `/moje-odpovedi`, admin) treat the agentic course as current for the command bar.
- The page header shows the current course's title, so it is always clear which course you are in.

### Switching courses

- **Command:** `/course` with the Czech alias `/kurz`, added to the registry in `src/lib/commands.ts`:
  - `/course data` opens the Data course's title page; `/course agent` opens the agentic course's title page.
  - The argument matches the course number (1, 2, in declaration order), course id, or words of the course title, mirroring how `/open` matches lectures.
  - `/course` without an argument shows a message listing both courses as clickable suggestions, with the current one marked.
  - While typing, the command bar completes course ids/titles after `/course `, like `/open`.
  - `/help` lists the command.
- **Link:** each course's title page shows a clickable link to the other course (e.g. "Další kurz: Digitální akademie: Data" / back to the agentic course). The exact wording is the builder's call, in Czech.
- The command bar context (`CommandContext`) carries the list of courses and the current course id.

### Commands within a course

- `/open`, `/next`, `/back` and lecture numbering work within the current course only. Lecture numbers start at 1 in each course.
- `/home` goes to the current course's title page.
- `/search` searches the current course only (`/hledat` or `/data/hledat`).

### Saved answers

- The database schema stays the same apart from what the builder needs for listing (see below). Saving works as today.
- **Moje odpovědi** (`/moje-odpovedi`) lists answers from both courses, grouped by course. Its Markdown export includes both, grouped by course.
- **Admin answers** (`/admin/odpovedi`) gets a course filter in addition to the existing learner/exercise filters. Its export respects the filter.
- Which course an answer belongs to: either add a `course_id` snapshot column to `responses` (filled at save time, with existing rows backfilled as the agentic course in the migration), or derive it from the current model via the lecture id. **Builder's call.** The column is more robust when content is removed, which matches how the table already snapshots titles.

### Docs to update

`docs/content-contract.md` (layout, course id, `courses`, cross-course uniqueness), `docs/data-model.md` (if `responses` changes), `docs/admin-guide.md` (one publish covers both courses), `README.md` (layout note), and the e2e fixture content (`fixtures/content/e2e`), which gets a small `data/` course.

## Constraints

- Stack and conventions as in `docs/decisions.md`: Astro SSR, Drizzle/Postgres, Vitest + Playwright/axe. Czech UI text, English code and docs.
- Accessibility checks (axe) must pass on the new pages. Mobile layout must keep working.
- The site must keep working for a repository with no `courses` key (agentic course only). This keeps the current content and the existing test fixtures valid.

## Left to the builder

- Exact YAML key names and the agentic course's id (`agent` is a placeholder).
- Route implementation: whether to duplicate Astro page files under `src/pages/data/` or use a dynamic `[course]` segment, as long as the agentic course's existing addresses are unchanged.
- 404 vs. redirect for a lecture requested under the wrong course prefix.
- Whether `responses` gets a `course_id` column (recommended) or derives it from the model.
- Czech wording of the link, messages and help text.
- How the `ContentModel` type represents multiple courses (e.g. `courses: CourseModel[]` with the agentic course first).

## Acceptance

- With content containing both courses, a signed-in learner can: open `/`, see the agentic lecture list and a link to the Data course; run `/course data` and land on `/data/`; open, read and answer an exercise in a Data lecture; run `/open 1` inside Data and get Data lecture 1; run `/course agent` and return to `/`.
- A duplicate lecture or exercise id across the two courses fails publishing with a clear validation issue.
- An error in the Data course blocks publishing and leaves the previous revision active.
- Existing `/lekce/...` links and saved answers for the agentic course keep working after the change.
- A visitor who isn't signed in sees only public lectures in each course.
- Unit tests cover the loader/validator changes and the `/course` command, integration tests cover publishing and answers, and e2e tests cover switching courses.
