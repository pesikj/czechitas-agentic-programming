import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent, renderMarkdown } from '../src/lib/content/index';
import { RESERVED_COURSE_IDS } from '../src/lib/content/validate';

const fixtures = path.resolve('fixtures/content');

describe('loadContent — minimal fixture', async () => {
  const { model, issues } = await loadContent(path.join(fixtures, 'minimal'));

  const course = model?.courses[0];

  it('loads without issues', () => {
    expect(issues).toEqual([]);
    expect(model).toBeDefined();
  });

  it('is a single main course with the default id', () => {
    expect(model!.courses.map((c) => [c.id, c.basePath])).toEqual([['agent', '']]);
  });

  it('keeps the authored navigation tree and order', () => {
    expect(course!.title).toBe('Testovací kurz');
    expect(course!.toc).toEqual([
      {
        kind: 'group',
        title: 'Základy',
        children: [
          { kind: 'lecture', lectureId: 'zaklady' },
          { kind: 'lecture', lectureId: 'prompty' },
        ],
      },
      { kind: 'lecture', lectureId: 'zaver' },
    ]);
    expect(course!.lectures.map((lecture) => lecture.id)).toEqual(['zaklady', 'prompty', 'zaver']);
  });

  it('numbers parts and takes identity from ids, not file names', () => {
    const [first] = course!.lectures;
    expect(first!.dir).toBe('lectures/01-zaklady');
    expect(first!.parts.map((part) => [part.id, part.number, part.file])).toEqual([
      ['uvod', 1, 'lectures/01-zaklady/01-uvod.md'],
      ['prvni-cviceni', 2, 'lectures/01-zaklady/02-cviceni.md'],
    ]);
  });

  it('extracts exercises with fields', () => {
    const exercise = model!.exercises.get('prvni-prompt');
    expect(exercise).toMatchObject({ revision: 1, lectureId: 'zaklady', partId: 'prvni-cviceni', courseId: 'agent' });
    expect(exercise!.fields.map((field) => field.label)).toEqual(['Použitý prompt', 'Výsledek a ověření', 'Reflexe']);
  });

  it('resolves image assets relative to the part', () => {
    expect(course!.lectures[0]!.parts[0]!.assets).toEqual([
      { kind: 'image', url: 'images/schema.png', path: 'lectures/01-zaklady/images/schema.png', exists: true, line: 10 },
    ]);
  });

  it('resolves linked files in subdirectories, including reference-style links', () => {
    expect(course!.lectures[0]!.parts[1]!.assets).toEqual([
      { kind: 'file', url: 'soubory/prodeje.csv', path: 'lectures/01-zaklady/soubory/prodeje.csv', exists: true, line: 6 },
      { kind: 'file', url: 'skripty/analyza.py', path: 'lectures/01-zaklady/skripty/analyza.py', exists: true, line: 6 },
    ]);
  });
});

describe('loadContent — courses fixture', async () => {
  const { model, issues } = await loadContent(path.join(fixtures, 'courses'));
  const data = model?.courses[1];

  it('loads the main course and the additional courses in declaration order', () => {
    expect(issues).toEqual([]);
    expect(model!.courses.map((c) => [c.id, c.title, c.basePath])).toEqual([
      ['agent', 'Testovací kurz', ''],
      ['data', 'Digitální akademie: Data', '/data'],
    ]);
  });

  it('keeps repository-relative paths for the additional course', () => {
    const [lecture] = data!.lectures;
    expect(lecture).toMatchObject({ id: 'tabulky', dir: 'data/lectures/01-tabulky', basePath: '/data', courseId: 'data' });
    expect(lecture!.parts[0]!.file).toBe('data/lectures/01-tabulky/tabulky.md');
    expect(lecture!.parts[0]!.assets.map((asset) => asset.path)).toEqual(['data/lectures/01-tabulky/images/graf.png']);
    expect(lecture!.parts[0]!.assets[0]!.exists).toBe(true);
  });

  it('collects the exercises of every course, each with its course', () => {
    expect([...model!.exercises.values()].map((exercise) => [exercise.id, exercise.courseId])).toEqual([
      ['prvni-prompt', 'agent'],
      ['prvni-tabulka', 'data'],
    ]);
    expect([...data!.exercises.keys()]).toEqual(['prvni-tabulka']);
    expect([...model!.courses[0]!.exercises.keys()]).toEqual(['prvni-prompt']);
  });
});

describe('loadContent — course declarations', () => {
  async function load(courseYaml: string, dataCourseYaml = 'title: D\ntoc:\n  - lecture: b\n') {
    const dir = await mkdtemp(path.join(tmpdir(), 'content-'));
    await mkdir(path.join(dir, 'lectures/a'), { recursive: true });
    await mkdir(path.join(dir, 'data/lectures/b'), { recursive: true });
    await writeFile(path.join(dir, 'course.yaml'), courseYaml);
    await writeFile(path.join(dir, 'lectures/a/lecture.yaml'), 'id: a\ntitle: A\nparts: [p.md]\n');
    await writeFile(path.join(dir, 'lectures/a/p.md'), '---\nid: p\ntitle: P\n---\n\nText\n');
    await writeFile(path.join(dir, 'data/course.yaml'), dataCourseYaml);
    await writeFile(path.join(dir, 'data/lectures/b/lecture.yaml'), 'id: b\ntitle: B\nparts: [p.md]\n');
    await writeFile(path.join(dir, 'data/lectures/b/p.md'), '---\nid: p\ntitle: P\n---\n\nText\n');
    const result = await loadContent(dir);
    await rm(dir, { recursive: true });
    return result;
  }
  const errors = (result: Awaited<ReturnType<typeof load>>) =>
    result.issues.filter((issue) => issue.severity === 'error').map((issue) => [issue.code, issue.file]);

  it('takes the main course id from course.yaml', async () => {
    const { model } = await load('id: kurz\ntitle: T\ntoc:\n  - lecture: a\ncourses: [data]\n');
    expect(model!.courses.map((c) => c.id)).toEqual(['kurz', 'data']);
  });

  it('rejects a course declared twice', async () => {
    expect(errors(await load('title: T\ntoc:\n  - lecture: a\ncourses: [data, data]\n'))).toEqual([['course-id-duplicate', 'course.yaml']]);
  });

  it('reserves the main course id for additional courses', async () => {
    expect(errors(await load('id: data\ntitle: T\ntoc:\n  - lecture: a\ncourses: [data]\n'))).toEqual([['course-id-reserved', 'course.yaml']]);
  });

  it('allows neither id nor courses in an additional course.yaml', async () => {
    for (const extra of ['id: data\n', 'courses: [x]\n']) {
      const result = await load('title: T\ntoc:\n  - lecture: a\ncourses: [data]\n', `${extra}title: D\ntoc:\n  - lecture: b\n`);
      expect(errors(result)).toEqual([['schema-invalid', 'data/course.yaml']]);
    }
  });

  it('reserves the names of site routes', () => {
    expect(RESERVED_COURSE_IDS).toEqual([
      '404', '_astro', '_image', 'admin', 'health', 'hledat', 'lekce', 'moje-odpovedi', 'nahled-odpovedi',
      'obnova-hesla', 'obsah', 'odhlaseni', 'odpovedi', 'prihlaseni', 'zapomenute-heslo', 'zmena-hesla',
    ]);
  });
});

describe('loadContent — lecture titles', () => {
  async function lectureTitle(title: string) {
    const dir = await mkdtemp(path.join(tmpdir(), 'content-'));
    await mkdir(path.join(dir, 'lectures/a'), { recursive: true });
    await writeFile(path.join(dir, 'course.yaml'), 'title: T\ntoc:\n  - lecture: a\n');
    await writeFile(path.join(dir, 'lectures/a/lecture.yaml'), `id: a\ntitle: "${title}"\nparts: [p.md]\n`);
    await writeFile(path.join(dir, 'lectures/a/p.md'), '---\nid: p\ntitle: P\n---\n\nText\n');
    const { model } = await loadContent(dir);
    await rm(dir, { recursive: true });
    return model!.courses[0]!.lectures[0]!.title;
  }

  it('drops leading zeros from the authored lecture number', async () => {
    expect(await lectureTitle('01 – Instalace nástrojů')).toBe('1 – Instalace nástrojů');
    expect(await lectureTitle('007 – Agent')).toBe('7 – Agent');
  });

  it('keeps other titles unchanged', async () => {
    for (const title of ['10 – Git', '0 – Úvod', 'Python v době AI', '2026: rok agentů']) {
      expect(await lectureTitle(title)).toBe(title);
    }
  });
});

describe('loadContent — linked files', () => {
  async function issuesFor(markdown: string) {
    const dir = await mkdtemp(path.join(tmpdir(), 'content-'));
    await mkdir(path.join(dir, 'lectures/a'), { recursive: true });
    await writeFile(path.join(dir, 'course.yaml'), 'title: T\ntoc:\n  - lecture: a\n');
    await writeFile(path.join(dir, 'lectures/a/lecture.yaml'), 'id: a\ntitle: A\nparts: [p.md]\n');
    await writeFile(path.join(dir, 'lectures/a/p.md'), `---\nid: p\ntitle: P\n---\n\n${markdown}\n`);
    const result = await loadContent(dir);
    await rm(dir, { recursive: true });
    return result;
  }

  it('ignores web links, site routes, anchors and unsupported file types', async () => {
    const { model, issues } = await issuesFor(
      '[web](https://example.com/data.csv) [mail](mailto:a@b.cz) [hledat](/hledat) [kotva](#cast) [stránka](jinde.html)',
    );
    expect(issues).toEqual([]);
    expect(model!.courses[0]!.lectures[0]!.parts[0]!.assets).toEqual([]);
  });

  it('rejects linked files outside the repository', async () => {
    const { model, issues } = await issuesFor('[data](../../../data.csv)');
    expect(model).toBeUndefined();
    expect(issues).toMatchObject([{ severity: 'error', code: 'asset-outside-repo', line: 6 }]);
  });
});

describe('loadContent — invalid fixtures', () => {
  const errorCases: Record<string, string> = {
    'course-missing': 'course-missing',
    'lecture-id-duplicate': 'lecture-id-duplicate',
    'id-invalid': 'id-invalid',
    'part-missing': 'part-missing',
    'exercise-invalid': 'exercise-invalid',
    'exercise-id-duplicate': 'exercise-id-duplicate',
    'asset-outside-repo': 'asset-outside-repo',
    'course-id-reserved': 'course-id-reserved',
    'course-dir-missing': 'course-missing',
  };
  /** Missing course files have no line to point at. */
  const withoutLine = new Set(['course-missing', 'course-dir-missing']);

  it('has a test for every invalid fixture', async () => {
    const dirs = await readdir(path.join(fixtures, 'invalid'));
    expect(dirs.sort()).toEqual([...Object.keys(errorCases), 'asset-missing', 'cross-course-duplicate'].sort());
  });

  for (const [dir, code] of Object.entries(errorCases)) {
    it(`${dir} fails with exactly ${code}`, async () => {
      const { model, issues } = await loadContent(path.join(fixtures, 'invalid', dir));
      expect(model).toBeUndefined();
      const errors = issues.filter((issue) => issue.severity === 'error');
      expect(errors.map((issue) => issue.code)).toEqual([code]);
      if (!withoutLine.has(dir)) expect(errors[0]!.line).toBeTypeOf('number');
    });
  }

  it('reports where each error is', async () => {
    const reserved = await loadContent(path.join(fixtures, 'invalid', 'course-id-reserved'));
    expect(reserved.issues).toMatchObject([{ code: 'course-id-reserved', file: 'course.yaml' }]);
    const missing = await loadContent(path.join(fixtures, 'invalid', 'course-dir-missing'));
    expect(missing.issues).toMatchObject([{ code: 'course-missing', file: 'data/course.yaml' }]);
  });

  it('rejects lecture and exercise ids reused across courses', async () => {
    const { model, issues } = await loadContent(path.join(fixtures, 'invalid', 'cross-course-duplicate'));
    expect(model).toBeUndefined();
    expect(issues.filter((issue) => issue.severity === 'error').map((issue) => [issue.code, issue.file])).toEqual([
      ['lecture-id-duplicate', 'data/lectures/01-tabulky/lecture.yaml'],
      ['exercise-id-duplicate', 'data/lectures/01-tabulky/tabulky.md'],
    ]);
  });

  it('reports a missing (wrong-case) image as a warning and still loads', async () => {
    const { model, issues } = await loadContent(path.join(fixtures, 'invalid', 'asset-missing'));
    expect(model).toBeDefined();
    expect(issues).toMatchObject([
      { severity: 'warning', code: 'asset-missing', file: 'lectures/01-zaklady/01-uvod.md', line: 10 },
      { severity: 'warning', code: 'asset-missing', file: 'lectures/01-zaklady/02-cviceni.md', line: 6 },
    ]);
  });
});

describe('renderMarkdown', () => {
  it('renders GFM and Czech text', async () => {
    const html = await renderMarkdown('# Ahoj\n\n| a | b |\n|---|---|\n| ž | ~~x~~ |\n\n- [x] hotovo', { mode: 'response' });
    expect(html).toContain('<h1>Ahoj</h1>');
    expect(html).toContain('<table tabindex="0">');
    expect(html).toContain('<del>x</del>');
    expect(html).toContain('type="checkbox"');
  });

  it('never outputs scripts, event handlers or javascript: links', async () => {
    const source = '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[klik](javascript:alert(1))';
    for (const mode of ['content', 'response'] as const) {
      const html = await renderMarkdown(source, { mode });
      expect(html).not.toMatch(/<script|onerror|javascript:/i);
    }
  });

  it('renders exercises and alternatives as placeholders in content mode', async () => {
    const source = '---\nid: a\ntitle: A\n---\n\n```exercise\nid: ukol\nrevision: 1\nfields: [{id: a, label: A}]\n```\n\n::::alternatives\n:::option{label="macOS"}\nX\n:::\n:::option{label="Linux"}\nY\n:::\n::::\n\nviz:soubor';
    const html = await renderMarkdown(source, { mode: 'content' });
    expect(html).toContain('<div class="exercise" data-exercise-id="ukol"></div>');
    expect(html).toContain('<section class="alternative" data-label="macOS">');
    expect(html).toContain('viz:soubor');
    expect(html).not.toContain('title: A');
  });

  it('treats exercise blocks as plain code in responses', async () => {
    const html = await renderMarkdown('```exercise\nid: x\n```', { mode: 'response' });
    expect(html).toContain('<code class="language-exercise">');
  });
});

describe('no hardcoded syllabus', () => {
  it('application source contains no fixture lecture ids or titles', async () => {
    const files = await readdir('src', { recursive: true });
    const sources = await Promise.all(
      files.filter((file) => /\.(ts|astro)$/.test(file)).map((file) => readFile(path.join('src', file), 'utf8')),
    );
    for (const text of ['zaklady', 'prvni-prompt', 'Základy práce']) {
      expect(sources.some((source) => source.includes(text))).toBe(false);
    }
  });
});

describe('renderMarkdown — page features', () => {
  it('labels code blocks by kind', async () => {
    const html = await renderMarkdown(
      '```bash\nls\n```\n\n```prompt\nUdělej\n```\n\n```output\nok\n```\n\n```text\nx\n```\n\n```python\nprint(1)\n```',
      { mode: 'content' },
    );
    expect(html).toContain('<div class="code-block" data-kind="terminal"><span class="code-label">Terminál</span>');
    expect(html).toContain('data-kind="prompt"><span class="code-label">Prompt pro agenta</span>');
    expect(html).toContain('data-kind="output"><span class="code-label">Výstup</span>');
    expect(html).toContain('<div class="code-block" data-kind="text"><pre tabindex="0">');
    expect(html).toContain('<span class="code-label">Kód (python)</span>');
  });

  it('marks mermaid blocks as diagrams and keeps their source as the fallback', async () => {
    const html = await renderMarkdown('```mermaid\nflowchart LR\n  a --> b\n```', { mode: 'content' });
    expect(html).toBe(
      '<div class="code-block" data-kind="diagram"><span class="code-label">Diagram</span><pre tabindex="0"><code class="language-mermaid">flowchart LR\n  a --> b\n</code></pre></div>',
    );
  });

  it('resolves images into lazy links and renders a fallback for missing ones', async () => {
    const html = await renderMarkdown('![Schéma](a.png)\n\n![Chybí](b.png)\n\n![Venku](https://example.com/c.png)', {
      mode: 'content',
      resolveImage: (url) =>
        url === 'a.png' ? { src: '/obsah/a.png', width: 10, height: 5 } : url === 'b.png' ? { missing: true } : undefined,
    });
    expect(html).toContain(
      '<a href="/obsah/a.png"><img src="/obsah/a.png" alt="Schéma" loading="lazy" decoding="async" width="10" height="5"></a>',
    );
    expect(html).toContain('<span class="image-missing">[Obrázek není k dispozici: Chybí]</span>');
    expect(html).toContain('<img src="https://example.com/c.png" alt="Venku"');
  });

  it('points linked files at the asset route and renders a fallback for missing ones', async () => {
    const html = await renderMarkdown(
      '[Data](data/a.csv), [skript][s], [chybí](data/b.csv), [web](https://example.com/c.csv)\n\n[s]: py/s.py',
      {
        mode: 'content',
        resolveLink: (url) =>
          url === 'data/a.csv'
            ? { href: '/obsah/data/a.csv' }
            : url === 'py/s.py'
              ? { href: '/obsah/py/s.py' }
              : url === 'data/b.csv'
                ? { missing: true }
                : undefined,
      },
    );
    expect(html).toContain('<a href="/obsah/data/a.csv" download>Data</a>');
    expect(html).toContain('<a href="/obsah/py/s.py" download>skript</a>');
    expect(html).toContain('<span class="file-missing">[Soubor není k dispozici: chybí]</span>');
    expect(html).toContain('<a href="https://example.com/c.csv">web</a>');
  });

  it('keeps a single page heading', async () => {
    const html = await renderMarkdown('---\nid: a\ntitle: Úvod\n---\n\n# Úvod\n\n## Detail\n\ntext', {
      mode: 'content',
      shiftHeadings: 1,
      omitLeadingHeading: 'Úvod',
    });
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('>Úvod<');
    expect(html).toContain('<h3>Detail</h3>');
  });

  it('shows alternative labels without JavaScript', async () => {
    const html = await renderMarkdown('::::alternatives\n:::option{label="Windows"}\nA\n:::\n:::option{label="Linux"}\nB\n:::\n::::', {
      mode: 'content',
    });
    expect(html).toContain('<p class="alternative-label"><strong>Windows</strong></p>');
  });
});
