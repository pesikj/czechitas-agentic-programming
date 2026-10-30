import { describe, expect, it } from 'vitest';
import { COMMANDS, completions, findCommand, runCommand, type CommandContext, type CourseTarget, type LectureTarget } from '../src/lib/commands';

const lecture = (number: number, id: string, title: string, parts: string[]): LectureTarget => ({
  number,
  id,
  title,
  href: `/lekce/${id}/p1`,
  parts: parts.map((partTitle, index) => ({ number: index + 1, title: partTitle, href: `/lekce/${id}/p${index + 1}` })),
});

const lectures = [
  lecture(1, 'uvod-do-agentu', 'Úvod do agentního programování', ['Co je agent', 'Instalace', 'První prompt', 'Cvičení']),
  lecture(2, 'prace-s-promptem', 'Práce s promptem', ['Iterace']),
  lecture(3, 'prompty-pro-pokrocile', 'Prompty pro pokročilé', ['Kontext', 'Ladění']),
];

const home: CommandContext = { page: 'home', lectures };
const middle: CommandContext = {
  page: 'part',
  lectures,
  lectureNumber: 1,
  previous: { title: 'A', href: '/lekce/uvod/a' },
  next: { title: 'C', href: '/lekce/uvod/c' },
  nextLecture: lectures[1]!,
};
const first: CommandContext = { page: 'part', lectures, lectureNumber: 1, next: { title: 'B', href: '/lekce/uvod/b' } };
const last: CommandContext = {
  page: 'part',
  lectures,
  lectureNumber: 1,
  previous: { title: 'B', href: '/lekce/uvod/b' },
  nextLecture: lectures[1]!,
};

const navigateTo = (input: string, context: CommandContext = home) => {
  const result = runCommand(input, context);
  return result.kind === 'navigate' ? result.href : result;
};

describe('findCommand', () => {
  it.each([
    ['/next', 'next'],
    ['next', 'next'],
    ['  /NEXT ', 'next'],
    ['/dalsi', 'next'],
    ['/další', 'next'],
    ['/zpět', 'back'],
    ['/domů', 'home'],
    ['/nápověda', 'help'],
    ['?', 'help'],
    ['/open 2', 'open'],
    ['/otevřít prompt', 'open'],
  ])('%s → %s', (input, name) => {
    expect(findCommand(input)?.name).toBe(name);
  });
});

describe('runCommand', () => {
  it('navigates with /next and /back', () => {
    expect(runCommand('/next', middle)).toEqual({ kind: 'navigate', href: '/lekce/uvod/c' });
    expect(runCommand('/back', middle)).toEqual({ kind: 'navigate', href: '/lekce/uvod/a' });
    expect(runCommand('/home', middle)).toEqual({ kind: 'navigate', href: '/' });
  });

  it('explains the beginning of a lecture', () => {
    expect(runCommand('/back', first)).toEqual({
      kind: 'message',
      text: 'Jste na začátku lekce.',
      suggestions: [{ label: '/home', command: '/home' }],
    });
  });

  it('offers the next lecture and its /open command at the end, without wrapping', () => {
    expect(runCommand('/next', last)).toEqual({
      kind: 'message',
      text: 'Toto je poslední část lekce. Další lekci otevřete příkazem /open 2.',
      suggestions: [
        { label: 'Další lekce: Práce s promptem', href: '/lekce/prace-s-promptem/p1' },
        { label: '/home', command: '/home' },
      ],
    });
  });

  it('suggests /open on the home page', () => {
    const result = runCommand('/next', home);
    expect(result.kind === 'message' && result.text).toBe('Nejdřív otevřete lekci, například příkazem /open 1.');
    expect(result.kind === 'message' && result.suggestions[0]).toEqual({
      label: '1 Úvod do agentního programování',
      command: '/open 1',
    });
  });

  it('shows help', () => {
    expect(runCommand('/help', middle)).toEqual({ kind: 'help' });
  });

  it('explains unknown commands with close suggestions', () => {
    const result = runCommand('/nxt', middle);
    expect(result.kind === 'message' && result.text).toBe('Neznámý příkaz „/nxt“.');
    expect(result.kind === 'message' && result.suggestions.map((suggestion) => suggestion.label)).toEqual(['/next', '/help']);
  });

  it('suggests only help for unrelated input', () => {
    const result = runCommand('/xyzzy', middle);
    expect(result.kind === 'message' && result.suggestions).toEqual([{ label: '/help', command: '/help' }]);
  });

  it('tells learners that shell commands belong in their terminal', () => {
    for (const input of ['ls', 'git status', 'claude', 'npm install', 'cd uvod']) {
      const result = runCommand(input, middle);
      expect(result.kind === 'message' && result.text).toMatch(/ne terminál/);
    }
  });

  it('truncates very long input in messages', () => {
    const result = runCommand(`/${'a'.repeat(100)}`, middle);
    expect(result.kind === 'message' && result.text.length).toBeLessThan(60);
  });

  it('handles empty input', () => {
    expect(runCommand('  ', middle).kind).toBe('message');
  });
});

describe('/search', () => {
  it('opens search results, also via the Czech alias', () => {
    expect(navigateTo('/search prompt pro agenta')).toBe('/hledat?q=prompt%20pro%20agenta');
    expect(navigateTo('/hledat', middle)).toBe('/hledat');
  });
});

describe('/open', () => {
  it('opens a lecture by number, from any page', () => {
    expect(navigateTo('/open 2')).toBe('/lekce/prace-s-promptem/p1');
    expect(navigateTo('/otevrit 3', middle)).toBe('/lekce/prompty-pro-pokrocile/p1');
    expect(navigateTo('open 1')).toBe('/lekce/uvod-do-agentu/p1');
  });

  it('opens a part with lecture.part (dot or Czech comma)', () => {
    expect(navigateTo('/open 1.3')).toBe('/lekce/uvod-do-agentu/p3');
    expect(navigateTo('/open 1,4')).toBe('/lekce/uvod-do-agentu/p4');
    expect(navigateTo('/open 2.')).toBe('/lekce/prace-s-promptem/p1');
  });

  it('opens by exact id', () => {
    expect(navigateTo('/open prace-s-promptem')).toBe('/lekce/prace-s-promptem/p1');
  });

  it('opens by unique title words, ignoring case and diacritics', () => {
    expect(navigateTo('/open uvod')).toBe('/lekce/uvod-do-agentu/p1');
    expect(navigateTo('/open POKROČILÉ')).toBe('/lekce/prompty-pro-pokrocile/p1');
    expect(navigateTo('/open prace prompt')).toBe('/lekce/prace-s-promptem/p1');
  });

  it('lists several matches instead of guessing', () => {
    expect(runCommand('/open prompt', home)).toEqual({
      kind: 'message',
      text: 'Výrazu „prompt“ odpovídá více lekcí:',
      suggestions: [
        { label: '2 Práce s promptem', command: '/open 2' },
        { label: '3 Prompty pro pokročilé', command: '/open 3' },
      ],
    });
  });

  it('explains missing lectures and parts', () => {
    const missingLecture = runCommand('/open 9', home);
    expect(missingLecture.kind === 'message' && missingLecture.text).toBe('Lekce 9 neexistuje. Kurz má 3 lekce.');
    expect(missingLecture.kind === 'message' && missingLecture.suggestions).toHaveLength(3);

    expect(runCommand('/open 2.5', home)).toEqual({
      kind: 'message',
      text: 'Lekce 2 má jen 1 část.',
      suggestions: [{ label: '2.1 Iterace', href: '/lekce/prace-s-promptem/p1' }],
    });

    const noMatch = runCommand('/open python', home);
    expect(noMatch.kind === 'message' && noMatch.text).toBe('Žádná lekce neodpovídá výrazu „python“.');
  });

  it('asks for an argument and lists lectures', () => {
    const result = runCommand('/open', home);
    expect(result.kind === 'message' && result.text).toBe('Napište číslo nebo název lekce, například /open 1.');
    expect(result.kind === 'message' && result.suggestions.map((suggestion) => suggestion.command)).toEqual([
      '/open 1',
      '/open 2',
      '/open 3',
    ]);
  });
});

describe('completions', () => {
  const values = (input: string, context: CommandContext = home) =>
    completions(input, context).map((completion) => completion.value);

  it('completes command names; /open completes with a space', () => {
    expect(values('/n')).toEqual(['/next', '/help']);
    expect(values('/h')).toEqual(['/search ', '/home', '/help']);
    expect(values('/ho')).toEqual(['/home']);
    expect(values('/zp')).toEqual(['/back']);
    expect(values('/o')).toEqual(['/open ']);
    expect(values('')).toEqual([]);
  });

  it('lists lectures after "/open "', () => {
    expect(completions('/open ', home)).toEqual([
      { value: '/open 1', label: '/open 1', description: 'Úvod do agentního programování' },
      { value: '/open 2', label: '/open 2', description: 'Práce s promptem' },
      { value: '/open 3', label: '/open 3', description: 'Prompty pro pokročilé' },
    ]);
    expect(values('/open prompt')).toEqual(['/open 2', '/open 3']);
    expect(values('/otevrit uvod')).toEqual(['/open 1']);
    expect(values('/open 2')).toEqual(['/open 2']);
  });

  it('lists parts after "/open N."', () => {
    expect(completions('/open 1.', home).map((completion) => [completion.value, completion.description])).toEqual([
      ['/open 1.1', 'Co je agent'],
      ['/open 1.2', 'Instalace'],
      ['/open 1.3', 'První prompt'],
      ['/open 1.4', 'Cvičení'],
    ]);
    expect(values('/open 1.3')).toEqual(['/open 1.3']);
    expect(values('/open 9.')).toEqual([]);
  });

  it('does not suggest arguments for other commands', () => {
    expect(values('/next 2')).toEqual([]);
  });
});

describe('/course', () => {
  const courses: CourseTarget[] = [
    { number: 1, id: 'agent', title: 'Agentní programování', href: '/', basePath: '' },
    { number: 2, id: 'data', title: 'Digitální akademie: Data', href: '/data/', basePath: '/data' },
  ];
  const multi: CommandContext = { page: 'home', lectures, courses, currentCourse: 'agent' };
  const inData: CommandContext = { page: 'home', lectures, courses, currentCourse: 'data' };
  const suggestions = [
    { label: '1 Agentní programování (aktuální)', command: '/course agent' },
    { label: '2 Digitální akademie: Data', command: '/course data' },
  ];

  it.each([
    ['/course data', '/data/'],
    ['/kurz 2', '/data/'],
    ['/course 1', '/'],
    ['/course akademie', '/data/'],
  ])('%s → %s', (input, href) => {
    expect(navigateTo(input, multi)).toBe(href);
  });

  it('lists the courses without an argument', () => {
    const result = runCommand('/course', multi);
    expect(result.kind).toBe('message');
    if (result.kind === 'message') expect(result.suggestions).toEqual(suggestions);
  });

  it('reports a missing course number', () => {
    expect(runCommand('/course 3', multi)).toEqual({
      kind: 'message',
      text: 'Kurz 3 neexistuje. K dispozici jsou 2 kurzy.',
      suggestions,
    });
  });

  it('reports an unmatched query', () => {
    const result = runCommand('/course xyz', multi);
    expect(result.kind === 'message' && result.text).toBe('Žádný kurz neodpovídá výrazu „xyz“.');
  });

  it('lists ambiguous matches', () => {
    const both: CommandContext = {
      page: 'home',
      lectures,
      courses: [
        { number: 1, id: 'a', title: 'První kurz', href: '/', basePath: '' },
        { number: 2, id: 'b', title: 'Druhý kurz', href: '/b/', basePath: '/b' },
      ],
    };
    const result = runCommand('/course kurz', both);
    expect(result.kind).toBe('message');
    if (result.kind === 'message') {
      expect(result.text).toBe('Výrazu „kurz“ odpovídá více kurzů:');
      expect(result.suggestions.map((s) => s.command)).toEqual(['/course a', '/course b']);
    }
  });

  it('says there is only one course when there are no others', () => {
    const one: CommandContext = { page: 'home', lectures, courses: [courses[0]!] };
    for (const ctx of [home, one]) {
      const result = runCommand('/course data', ctx);
      expect(result.kind === 'message' && result.text).toBe('K dispozici je jen jeden kurz.');
    }
  });

  it('scopes /home and /search to the current course', () => {
    expect(navigateTo('/home', inData)).toBe('/data/');
    expect(navigateTo('/search tabulka', inData)).toBe('/data/hledat?q=tabulka');
    expect(navigateTo('/home', multi)).toBe('/');
    expect(navigateTo('/home', home)).toBe('/');
    expect(navigateTo('/search x', home)).toBe('/hledat?q=x');
  });

  it('completes courses', () => {
    const data = { value: '/course data', label: '/course data', description: 'Digitální akademie: Data' };
    expect(completions('/course ', multi)).toEqual([
      { value: '/course agent', label: '/course agent', description: 'Agentní programování' },
      data,
    ]);
    expect(completions('/course d', multi)).toEqual([data]);
    expect(completions('/kur', multi)).toContainEqual(expect.objectContaining({ label: '/course', value: '/course ' }));
  });

  it('is listed in help with the kurz alias', () => {
    expect(COMMANDS.find((c) => c.name === 'course')?.aliases).toEqual(['kurz']);
  });
});
