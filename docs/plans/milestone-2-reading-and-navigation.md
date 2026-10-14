# Plan: Milestone 2 — Reading and command navigation

Source: `roadmap.md` §2 and `product-definition.md`. Builds on milestone 1 (`src/lib/content/`, `docs/content-contract.md`, `docs/decisions.md`).

## Context

Milestone 1 can load and validate the content repository into a `ContentModel` and render its Markdown to safe HTML, but nothing is shown to a learner yet. Milestone 2 delivers the **learning interface**: a learner can open the home screen, open a lecture, read one part at a time, and move with `/next`, `/back`, `/home` and `/help` or with clickable equivalents. It must work by keyboard, pointer and touch, beside an editor on a laptop, and on a phone.

**Out of scope:** sign-in (milestone 3), publishing (4), search (5), saving answers (6) — numbering as reordered in the roadmap. Progress tracking, resume and completion marks are excluded permanently.

**Constraint from the roadmap:** until access protection exists, the interface uses only non-sensitive sample content and runs **locally only**. A production build refuses to serve content routes until milestone 3 adds authentication (step 1).

## Acceptance (from the roadmap)

- Keyboard and pointer users can open a lecture, move both ways, return home, and open a direct part link.
- Long text, Czech characters, images and code stay usable on a laptop beside an editor (~700 px wide) and on a mobile viewport (375 px).
- There is no progress tracking and no command execution beyond website navigation.

## Design overview

```
src/server/content/provider.ts   getContent(): the active ContentModel + cached rendered parts
src/lib/navigation.ts            pure: lecture order, neighbours, boundaries, hrefs
src/lib/commands.ts              pure: command registry, parsing, results (message | navigate)
src/middleware.ts                M2: blocks content routes in production builds; M3: auth
src/layouts/CourseLayout.astro   shell: header, breadcrumb, nav tree, main, command bar
src/components/                  NavTree, Breadcrumb, PartHeader, PartPager, CommandBar,
                                 ThemeToggle, ExercisePanel (static), ImageDialog
src/pages/index.astro            home: course title + navigation tree
src/pages/lekce/[lectureId]/index.astro            → redirect to the first part
src/pages/lekce/[lectureId]/[partId].astro         one part
src/pages/obsah/[...path].ts     content images (allowlisted), protected in M3
src/pages/404.astro              general not-found page
src/styles/                      theme.css (WebTUI overrides, focus), prose.css (reading)
src/scripts/                     command-bar.ts, alternatives.ts, code-copy.ts, image-dialog.ts, theme.ts
```

Pages are server-rendered HTML that works without JavaScript; scripts only add enhancements. Clickable navigation and commands use **the same hrefs from `navigation.ts`**, so the two can never disagree.

## Steps

Each step is a small, reviewable change with its own tests.

### 1. Content provider, navigation model and production guard

- `CONTENT_DIR` env setting (dev: `../czechitas-agentic-programming-content`), documented as a **development-only source** that milestone 4 replaces with the active published revision.
- `provider.ts`: `getContent()` returns `{ model, issues }`. It caches in memory, invalidates in dev when any file's mtime changes, and caches rendered part HTML per `lectureId/partId`. If loading fails, a dev-only error page lists the validation issues (`file:line [code] message`).
- `navigation.ts` (pure, unit-tested):
  - `lectureOrder(model)`, `findPart(model, lectureId, partId)`, `firstPartHref(lecture)`, `partHref(lectureId, partId)` → `/lekce/<lectureId>/<partId>`
  - `neighbours(model, lectureId, partId)` → `{ previous?, next?, isFirst, isLast, nextLecture?, previousLecture? }`. `nextLecture` follows the depth-first toc order across groups. **Nothing wraps around.**
- `middleware.ts`: in a production build (`import.meta.env.PROD`), every route except static assets returns 503 "Not available before sign-in is implemented". Milestone 3 replaces this with the auth check, so content stays local-only until then. Dev binds to localhost (the Astro default).

### 2. Shell, themes and reading layout (no JavaScript yet)

- `CourseLayout.astro`, built with WebTUI:
  - **Header:** course title (link home), working-directory breadcrumb `~/kurz/<lectureId>/<NN>-<partId>`, theme toggle.
  - **Navigation tree** (`<nav aria-label="Obsah kurzu">`): groups → lectures → parts as nested lists. Each lecture is a `<details>` that is open for the current lecture. Parts show a monospace file-like name (`02-instalace`) plus the title, and the current part has `aria-current="page"`.
  - **Main area** with the part, and the **command bar** region docked at the bottom.
  - A skip link to the main content.
- **Themes:** WebTUI is light by default and dark through `data-webtui-theme="dark"` on `<html>`. A tiny inline head script sets the theme before first paint from `localStorage` (wrapped in try/catch) or `prefers-color-scheme`. The toggle button has `aria-pressed`.
- `theme.css`, fixes for WebTUI's base layer:
  - WebTUI sets `outline: none` on everything → restore visible `:focus-visible` outlines for all interactive elements.
  - WebTUI sets `word-break: break-all` on the body → use `normal` + `overflow-wrap: anywhere` for the UI and prose.
  - Map course colours onto WebTUI variables (`--background0..3`, `--foreground0..2`). Check contrast to WCAG AA in both themes.
- `prose.css`, scoped to `.prose`: a proportional reading font with a monospace fallback for code, ~68ch line length, 1.6 line height, styled headings, lists, blockquotes, tables (horizontal scroll inside a wrapper, never the page), task lists, `pre` with horizontal scroll, and `img { max-width: 100%; height: auto }`.
- **Home** (`/`): course title, a one-line explanation, the navigation tree with each lecture linking to its first part, and visible help on how to use commands. No personalised content, no "continue" action, no progress.
- **Part page:**
  - `PartHeader`: lecture title, part title, and **Část N z M**.
  - Rendered Markdown.
  - `PartPager`: links with `rel="prev"` / `rel="next"` labelled "Předchozí část" and "Další část". At the boundaries they offer the next lecture or home instead, with the same wording as the commands.
- **Missing pages:**
  - Unknown part in a known lecture: "Tato část už neexistuje nebo byla přesunuta" plus links to the lecture's first part and to home (the product definition's bookmark rule), status 404.
  - Unknown lecture or any other route: `404.astro` with links home.
  - `/lekce/<id>` redirects (302) to the first part.

### 3. Content rendering features

Extend `renderMarkdown` in `src/lib/content/markdown.ts`, keeping one pipeline for all modes:
- **Images:** replace `resolveImageUrl` with `resolveImage(url) → { src } | { missing: true }`, using the part's `AssetRef`s. Existing images become `/obsah/<repo-relative path>`. A missing image renders a readable fallback (`[Obrázek není k dispozici: <alt>]`) while the rest of the part still loads. Add `loading="lazy"` and decoding hints. Width and height come from reading image headers in the provider, where cheap, to avoid layout shift.
- **Asset route** `obsah/[...path].ts`: serve **only** paths that appear as existing assets in the current model (an allowlist, so files such as `course.yaml` or traversal attempts give 404). Set the content type from the extension and send `X-Content-Type-Options: nosniff` and `Cache-Control: private, max-age=300`. SVG also gets `Content-Security-Policy: sandbox`.
- **Enlarged images:** a script wraps each prose image in a button ("Zvětšit obrázek: <alt>") that opens a WebTUI-styled `<dialog>` with the full-size image and its alt text. It closes on Esc, the close button or a backdrop click, and returns focus to the image. Without JavaScript the image is a plain link to the file.
- **Code blocks:** a server-side label from the fence language — `bash`/`sh`/`zsh`/`powershell` → **Terminál**; `prompt` → **Prompt pro agenta**; `output` → **Výstup**; `text` → no label; any other language → **Kód (<language>)**. A copy button on every block except `output` copies only the code text (`navigator.clipboard`, with a polite "Zkopírováno" announcement and a select-text fallback). This needs a **content-contract addition**: the fence languages `prompt` and `output` (see the decisions to confirm).
- **Alternatives:** without JavaScript, every option is shown with its label as a heading. With JavaScript, it becomes an accessible tablist (`role="tablist"`, arrow keys, `aria-selected`). The chosen label is remembered in `localStorage` and applied to other alternatives on the page with the same label.
- **Exercises (static in M2):** `ExercisePanel` shows the exercise title, field labels and guidance in a bordered **Moje odpověď** panel with the note "Ukládání odpovědí zatím není k dispozici." It has no inputs, so nothing to save and nothing that blocks navigation. Milestone 6 replaces it with the editor.

### 4. Command bar

- `commands.ts`, a pure registry (unit-tested):
  - Commands: `next`, `back`, `home`, `help`. Each has a description, usage example and optional aliases.
  - Parsing: trim, case-insensitive, the leading `/` optional. The registry allows renaming later without touching the UI (the product definition leaves the final names open).
  - `run(input, context)` → `{ kind: 'navigate', href } | { kind: 'message', text, suggestions: Suggestion[] }`.
- **Behaviour** (Czech messages):
  - `/next` on the last part → "Toto je poslední část lekce." with suggestions for the next lecture (if any) and `/home`.
  - `/back` on the first part → "Jste na začátku lekce." with `/home` and the previous lecture.
  - On the home page, `/next` and `/back` → "Nejdřív otevřete lekci." with the lecture list as suggestions.
  - Unknown input → "Neznámý příkaz „…“." with the closest commands (prefix or edit distance) and `/help`. **The current part never changes.**
  - Shell-looking input (`ls`, `git status`, `claude`…) → "Toto je navigace webu, ne terminál. Příkazy pro agenta pište ve svém terminálu." This addresses the main interaction risk in the product definition.
  - `/help` → an inline panel listing the commands with examples. It also explains that `/back` means the previous part while the browser's Back button follows history.
- **UI** (`CommandBar.astro` + `command-bar.ts`):
  - A labelled `<input>` ("Příkaz") with a `>` prompt glyph.
  - ~~Visible command chips under the input~~: removed at the product owner's request. Commands stay visible through the input placeholder, the suggestion list, `/help` and the home-page help.
  - While typing, a filtered suggestion list follows the combobox pattern (`role="combobox"`, `aria-activedescendant`, arrow keys, Tab completes, Enter runs).
  - An `aria-live="polite"` message area.
  - The no-JS fallback is the pager links. The command bar is hidden without JavaScript via `<noscript>`-aware styling.
- **Keyboard rules:**
  - **Enter runs a command only inside the command bar.**
  - The global shortcut `/` focuses the command bar only when focus is not in an `input`, `textarea`, `select` or contenteditable element, and no modifier key is held. No other global shortcuts.
  - Esc clears the input or returns focus to the content.
- Navigation uses ordinary page loads (`location.assign`), so browser history behaves normally.

### 5. Responsive layout, accessibility and end-to-end tests

- **Breakpoints:**
  - ≥ 1024 px: navigation tree beside the content.
  - < 1024 px: the tree collapses behind an **Obsah** toggle (`aria-expanded`, a focus-trapped drawer, closed by Esc).
  - The command bar stays docked at the bottom on every width, with safe-area insets, and content gets bottom padding so the bar never covers text. Check behaviour when the on-screen keyboard is open.
- **Laptop split-screen check** at 700 × 800 and at 200 % browser zoom: no horizontal page scroll, and code and tables scroll inside their own boxes.
- **Accessibility:**
  - Landmarks, one `h1` per page, `lang="cs"`, labelled controls, visible focus, 44 px touch targets for the pager.
  - Respect `prefers-reduced-motion`.
  - Run axe checks in end-to-end tests.
- **End-to-end tests:** add `@playwright/test` and `@axe-core/playwright`. Tests run against `astro dev` with `CONTENT_DIR=fixtures/content/e2e`, a fixture that includes a long part, a missing image, alternatives, all code-block kinds and an exercise. Projects: desktop Chromium and mobile WebKit (iPhone).
  - **Navigation:** open home, open a lecture, `/next` → part 2, `/back` → part 1, boundary messages, `/home`.
  - **Command input:** an unknown command keeps the URL and shows suggestions; a shell-like command shows the "ne terminál" hint.
  - **Direct links:** a direct part link loads; an unknown part gives 404 with recovery links.
  - **Keyboard:** the complete journey works by keyboard alone (Tab, `/`, Enter).
  - **Images:** the enlarge dialog opens, closes with Esc and returns focus; the missing-image fallback is visible; `/obsah/course.yaml` and `/obsah/..%2F..` → 404.
  - **Interface:** the theme toggle persists across reload; the mobile navigation drawer opens and closes; no horizontal scroll at 375 px.
  - **Accessibility:** axe finds no serious or critical violations in either theme.
  - **Production guard:** `npm run build && node dist/server/entry.mjs` → content routes return 503.

## Tests summary

- **Unit (Vitest):** `navigation.ts` (neighbours, boundaries, cross-group next lecture, single-part lecture, missing ids), `commands.ts` (aliases, case, missing slash, unknown and shell-like input, suggestions, home context), renderer (image resolution and missing fallback, code labels, alternatives markup, sanitization still holds), and the asset-route allowlist.
- **End-to-end (Playwright):** the journeys above.
- **Manual:** VoiceOver pass on Safari, a real phone, side-by-side with VS Code and a terminal on a 13" laptop, Czech diacritics in every font weight.

## Decisions to confirm (proposed defaults)

| Decision | Proposal |
|---|---|
| Command names | Keep `/next`, `/back`, `/home`, `/help` as primary names, and also accept Czech aliases `/dalsi`, `/zpet`, `/domu`, `/napoveda` |
| Prompt/output code blocks | Add the fence languages `prompt` and `output` to the content contract. `text` stays a neutral block. The content-editor skill's `content-format.md` (in the content repo) then needs a matching update. |
| End-to-end tooling | Adopt Playwright + axe now, and reuse it in milestones 3–7 |
| URL scheme | `/lekce/<lectureId>/<partId>` (already in the contract); asset URLs `/obsah/<path>` |
| Syntax highlighting | Not in M2, because the labelled, readable plain code is enough. Revisit with Shiki after the pilot if needed. |

## Files touched

- **New:** the files listed in the design overview, plus `playwright.config.ts`, `tests/e2e/*.spec.ts`, `fixtures/content/e2e/`, `tests/navigation.test.ts`, `tests/commands.test.ts`.
- **Changed:**
  - `src/lib/content/markdown.ts` (image resolver, code labels, alternative headings)
  - `src/server/config.ts` and `.env.example` (`CONTENT_DIR`)
  - `docs/content-contract.md` (`prompt`/`output` languages)
  - `README.md` (end-to-end commands)
  - `package.json` (`test:e2e`)
- **Removed:** the placeholder `src/pages/index.astro`, which is replaced by the home page.
