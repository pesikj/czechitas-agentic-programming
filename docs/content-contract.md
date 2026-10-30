# Content contract

How the content repository (`czechitas-agentic-programming-content`) describes course materials for the website. It defines the **input format**, not the syllabus: courses, lectures, parts and their order come entirely from the repository.

Implementation: `src/lib/content/` · Validate a checkout: `npm run content:validate -- <dir>`

## Repository layout

```
course.yaml                  # main course: id, title, additional courses, ordered navigation
lectures/
  <directory>/               # any directory name, e.g. 01-uvod
    lecture.yaml             # lecture id, title, ordered parts
    <part>.md                # one file per lecture part
    images/…                 # images (any subdirectory is fine)
data/                        # an additional course, listed in the root course.yaml
  course.yaml                # its title and ordered navigation
  lectures/…                 # same layout as above
```

The main course lives at the repository root. Each additional course lives in a subdirectory named after its id and follows the same rules relative to that directory. All courses are validated and published together. Reported file paths and image and file paths stay **relative to the repository root** (e.g. `data/lectures/01-tabulky/images/graf.png`).

Files and directories can be renamed or moved freely: **identity comes from ids, never from paths.**

## `course.yaml`

```yaml
id: agent                    # optional, default "agent"; the main course's id
title: Agentní programování s Codex CLI a Claude Code
courses:                     # optional; additional courses, each in the directory of that name
  - data
toc:
  - title: Začínáme          # a group (nested navigation)
    items:
      - lecture: 01-uvod      # directory name inside lectures/
      - lecture: 02-prompty
  - lecture: 03-shrnuti       # a top-level lecture
```

- `toc` order is the navigation order. Groups can be nested and contain at least one item.
- A directory in `lectures/` that is not listed is reported as a warning and is not shown.
- `courses` order is the course order (`/course 2` is the first additional course). An additional course id follows the id pattern and becomes its URL prefix (`/data/`), so it must not be the main course id or a site address: `404`, `_astro`, `_image`, `admin`, `health`, `hledat`, `lekce`, `moje-odpovedi`, `nahled-odpovedi`, `obnova-hesla`, `obsah`, `odhlaseni`, `odpovedi`, `prihlaseni`, `zapomenute-heslo`, `zmena-hesla`.
- An additional course's `<id>/course.yaml` has only `title` and `toc` (its id is the directory name; it cannot declare further courses).

## `lecture.yaml`

```yaml
id: uvod-do-agentu
title: Úvod do agentního programování
public: true                 # optional; readable without signing in
parts:
  - 01-co-je-agent.md
  - 02-instalace.md
```

- `title` is shown as written. The site adds no lecture numbers of its own, so number lectures in the title if you want them (`01 – Instalace nástrojů`); leading zeros are dropped on the site (`1 – Instalace nástrojů`).
- `public` (optional, default `false`): when `true`, anyone can read the lecture, its images and its linked files without an account, and the title page and sign-in page link to it. Use it for material learners need before the course, such as tool installation. Everything else stays sign-in only.
- `parts` order is the part order (**Část 1 z N**). The paths are relative to the lecture directory and must be `.md` files inside it.
- A `.md` file in the lecture directory that is not listed is reported as a warning.

## Part files

Every part begins with front matter:

```markdown
---
id: co-je-agent
title: Co je programovací agent
---

# Co je programovací agent
…
```

## Identifiers

| Id | Pattern | Unique within | Used for |
|---|---|---|---|
| Course `id` | `^[a-z0-9]+(-[a-z0-9]+)*$` | repository | URL prefix of an additional course `/<courseId>/` |
| Lecture `id` | same | **whole repository** (all courses) | URL `/lekce/<lectureId>/<partId>` |
| Part `id` | same | its lecture | URL, bookmarks |
| Exercise `id` | same | **whole repository** (all courses) | linking saved responses |
| Field `id` | same | its exercise | keys of saved response fields |

Use lowercase letters without diacritics, digits and single hyphens. **Do not change an id once published.** Changing it breaks bookmarks, and for exercises it detaches the saved responses (the old responses stay readable by administrators). **Never reuse a published exercise id, in either course**, even after the exercise is removed: learners' old answers would attach to the new exercise. Validation cannot detect this.

## Exercises

A fenced block with the language `exercise` defines an optional response panel (**Moje odpověď**) at that position. The instructions are ordinary Markdown above it.

````markdown
```exercise
id: prvni-prompt-reflexe
revision: 1
title: Váš první prompt          # optional
fields:
  - id: prompt
    label: Použitý prompt
    guidance: Vložte prompt, včetně dalších pokusů.   # optional
  - id: reflexe
    label: Reflexe
```
````

- `revision` is a positive integer. **Increase it when the meaning of the exercise changes**; saved answers to an older revision are then marked as referring to an earlier version. Do not increase it for typo fixes.
- Field order is the display order. All responses are optional.
- A part can contain several exercises.

## Tool/OS alternatives

Shown as a selector only where authored. The outer fence must be **longer** than the inner ones:

```markdown
::::alternatives
:::option{label="macOS"}
Otevřete **Terminal**…
:::
:::option{label="Windows"}
Otevřete **PowerShell**…
:::
::::
```

An `alternatives` block contains only `option` blocks (at least two), and each option has a non-empty `label`.

## Markdown dialect

The same dialect is used for course pages, learner response previews and administrator views:

- **CommonMark** + **GitHub-flavored Markdown**: tables, task lists, strikethrough, autolinks, footnotes.
- In content only: YAML front matter, `exercise` blocks and the `alternatives` directive. Learner responses use plain CommonMark + GFM, so an `exercise` block there is just code.
- **Raw HTML is not rendered** (a warning is reported in content), and all output is sanitized. Scripts, event handlers and `javascript:` links never reach the page. Code examples are never executed.
- Other `:name` directives are not supported. Container and leaf directives produce a warning; inline ones (e.g. accidental `viz:soubor`) are shown as plain text.
- The fence language tells learners what kind of example they are looking at:

  | Fence language | Shown as | Copy button |
  |---|---|---|
  | `bash`, `sh`, `zsh`, `shell`, `console`, `powershell`, `pwsh`, `ps1`, `cmd` | **Terminál** | yes |
  | `prompt` | **Prompt pro agenta** | yes |
  | `output` | **Výstup** (expected output) | no |
  | `text`, `txt`, `plaintext` or none | neutral block, no label | yes |
  | `mermaid` | **Diagram**: drawn from the [Mermaid](https://mermaid.js.org) source in the learner's colour theme; the source stays available under it. Without JavaScript, or if the source is invalid, it is shown as code | no |
  | any other language, e.g. `python` | **Kód (python)** | yes |

## Images

- Use standard Markdown syntax: `![alternative text](images/screen.png)`. Reference-style images work too.
- Paths are **relative to the Markdown file**, must stay inside the repository, and are **case-sensitive** (the production server runs on Linux).
- Allowed types: `.png .jpg .jpeg .gif .webp .svg`. SVG is served only as an image file.
- Images are served only to signed-in users. External image URLs are reported as a warning and are **not displayed**: the site's Content Security Policy loads images only from itself, so they cannot bypass sign-in or reveal learners to other servers.
- Missing alternative text → warning. A missing file → warning; the part still loads and shows a placeholder.

## Linked files

- Link to data, code or other material with an ordinary Markdown link: `[prodeje](data/prodeje.csv)`, `[skript](skripty/analyza.py)`. Reference-style links work too.
- Paths follow the image rules: **relative to the Markdown file**, inside the repository, **case-sensitive**.
- Downloadable types: `.csv .tsv .json .xml .yaml .yml .txt .md .xlsx .xls .parquet .py .ipynb .js .ts .sql .sh .ps1 .zip .pdf`. Links to other paths (websites, site pages like `/hledat`, `#anchors`, other extensions) are left as written.
- Files are served only to signed-in users (or with a public lecture) and always as a **download**; the browser never opens or runs them. Only files linked from the content are served, never the rest of the repository.
- A missing file → warning; the part still loads and shows a placeholder instead of the link. A path outside the repository → error.

## Validation

`loadContent()` returns a model only when there are **no errors**. Publishing (milestone 4) refuses a revision with errors and keeps the previous one. Warnings are shown to the administrator but do not block publishing. Each issue has a severity, a code, a file and, where possible, a line.

| Code | Severity | Meaning |
|---|---|---|
| `course-missing` | error | No `course.yaml` at the root or in a listed course directory |
| `course-id-reserved` | error | An additional course id is the main course id or a site address |
| `course-id-duplicate` | error | An additional course is listed twice in `courses` |
| `yaml-invalid` | error | YAML syntax error |
| `schema-invalid` | error | Missing or unknown keys, wrong types, missing front matter |
| `id-invalid` | error | Id does not match the pattern |
| `lecture-missing` | error | A listed lecture directory or its `lecture.yaml` is missing |
| `lecture-id-duplicate` / `part-id-duplicate` | error | Duplicate id (lecture ids across all courses) |
| `part-missing` / `part-path-invalid` | error | A listed part does not exist or is not a `.md` file inside the lecture |
| `exercise-invalid` | error | Malformed exercise YAML or schema |
| `exercise-id-duplicate` / `field-id-duplicate` | error | Duplicate exercise id (across all courses) or field id |
| `alternatives-invalid` | error | Malformed alternatives block |
| `asset-path-invalid` / `asset-outside-repo` / `asset-type-unsupported` | error | Unusable image or linked-file path |
| `lecture-unlisted` / `part-unlisted` | warning | A file or directory exists but is not listed |
| `asset-missing` / `asset-external` / `image-alt-missing` | warning | Image or linked-file problems that do not block the part |
| `raw-html-ignored` / `directive-unknown` | warning | Unsupported syntax, shown as text or dropped |
