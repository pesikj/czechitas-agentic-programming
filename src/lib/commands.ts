// Website navigation commands. Pure and shared by the server (page context) and the
// browser (command bar). These are NOT shell commands: nothing is executed.

export interface PartTarget {
  /** 1-based position within the lecture. */
  number: number;
  title: string;
  href: string;
}

/** A lecture as the command bar sees it; numbers follow the current navigation order. */
export interface LectureTarget {
  number: number;
  id: string;
  title: string;
  href: string;
  parts: PartTarget[];
}

/** A course as the command bar sees it. */
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

interface CourseFields {
  courses?: CourseTarget[];
  /** A course id; absent means the first course. */
  currentCourse?: string;
}

interface Destination {
  title: string;
  href: string;
}

export type CommandContext =
  | ({ page: 'home'; lectures: LectureTarget[] } & CourseFields)
  | ({
      page: 'part';
      lectures: LectureTarget[];
      lectureNumber: number;
      previous?: Destination;
      next?: Destination;
      previousLecture?: LectureTarget;
      nextLecture?: LectureTarget;
    } & CourseFields)
  | ({ page: 'other'; lectures: LectureTarget[] } & CourseFields);

export interface Suggestion {
  label: string;
  /** Either runs a command (the full command text) or opens a link. */
  command?: string;
  href?: string;
}

export type CommandResult =
  | { kind: 'navigate'; href: string }
  | { kind: 'help' }
  | { kind: 'message'; text: string; suggestions: Suggestion[] };

export type CommandName = 'next' | 'back' | 'open' | 'search' | 'course' | 'home' | 'help';

export interface CommandDefinition {
  name: CommandName;
  /** Accepted alternative names (Czech, without diacritics; input is normalised). */
  aliases: string[];
  description: string;
  /** Examples shown in help, for commands that take an argument. */
  examples?: string[];
}

export const COMMANDS: readonly CommandDefinition[] = [
  { name: 'next', aliases: ['dalsi'], description: 'Další část lekce' },
  { name: 'back', aliases: ['zpet'], description: 'Předchozí část lekce' },
  {
    name: 'open',
    aliases: ['otevrit'],
    description: 'Otevřít lekci podle čísla, názvu nebo id; s tečkou i konkrétní část',
    examples: ['/open 2', '/open prompt', '/open 2.3'],
  },
  {
    name: 'search',
    aliases: ['hledat'],
    description: 'Hledat ve všech materiálech',
    examples: ['/search prompt'],
  },
  {
    name: 'course',
    aliases: ['kurz'],
    description: 'Přepnout na jiný kurz podle čísla, názvu nebo id',
    examples: ['/course data', '/course 1'],
  },
  { name: 'home', aliases: ['domu'], description: 'Úvodní stránka s přehledem lekcí' },
  { name: 'help', aliases: ['napoveda', '?'], description: 'Nápověda k příkazům' },
];

const SHELL_WORDS = new Set([
  'ls', 'cd', 'pwd', 'dir', 'git', 'npm', 'npx', 'node', 'python', 'python3', 'py', 'pip', 'pip3', 'uv',
  'claude', 'codex', 'mkdir', 'rm', 'cat', 'echo', 'code', 'brew', 'cp', 'mv', 'touch', 'sudo',
  'clear', 'cls', 'exit', 'curl', 'docker', 'winget', 'choco',
]);

export const commandLabel = (name: CommandName): string => `/${name}`;

/** Lowercase, trimmed, without diacritics. */
function fold(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Splits input into the folded command word (without "/") and the raw argument. */
function parse(input: string): { word: string; arg: string } {
  const match = /^\/?(\S*)\s*(.*)$/s.exec(input.trim());
  return { word: fold(match?.[1] ?? ''), arg: (match?.[2] ?? '').trim() };
}

function byWord(word: string): CommandDefinition | undefined {
  return COMMANDS.find((command) => command.name === word || command.aliases.includes(word));
}

export function findCommand(input: string): CommandDefinition | undefined {
  return byWord(parse(input).word);
}

/** Czech plural: 1 lekce, 2–4 lekce, 5+ lekcí. */
function count(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

const PART_REFERENCE = /^(\d+)[.,](\d*)$/;

const lectureSuggestion = (lecture: LectureTarget): Suggestion => ({
  label: `${lecture.number} ${lecture.title}`,
  command: `/open ${lecture.number}`,
});

const courseSuggestion = (course: CourseTarget, current?: CourseTarget): Suggestion => ({
  label: `${course.number} ${course.title}${course === current ? ' (aktuální)' : ''}`,
  command: `/course ${course.id}`,
});

/** The course the context belongs to (the first one when unspecified). */
function currentCourseOf(context: CommandContext): CourseTarget | undefined {
  const courses = context.courses ?? [];
  return courses.find((course) => course.id === context.currentCourse) ?? courses[0];
}

export function runCommand(input: string, context: CommandContext): CommandResult {
  const raw = input.trim();
  if (raw === '' || raw === '/') {
    return { kind: 'message', text: 'Napište příkaz, například /next.', suggestions: allSuggestions() };
  }

  const { arg } = parse(raw);
  const command = findCommand(raw);
  if (!command) return unknown(raw);

  const home: Suggestion = { label: '/home', command: '/home' };
  switch (command.name) {
    case 'help':
      return { kind: 'help' };
    case 'home':
      return { kind: 'navigate', href: currentCourseOf(context)?.href ?? '/' };
    case 'course':
      return course(arg, context);
    case 'open':
      return open(arg, context.lectures);
    case 'search':
      return {
        kind: 'navigate',
        href: `${currentCourseOf(context)?.basePath ?? ''}${arg ? `/hledat?q=${encodeURIComponent(arg)}` : '/hledat'}`,
      };
    case 'next':
      if (context.page !== 'part') return notInLecture(context);
      if (context.next) return { kind: 'navigate', href: context.next.href };
      return {
        kind: 'message',
        text: context.nextLecture
          ? `Toto je poslední část lekce. Další lekci otevřete příkazem /open ${context.nextLecture.number}.`
          : 'Toto je poslední část lekce.',
        suggestions: [
          ...(context.nextLecture ? [{ label: `Další lekce: ${context.nextLecture.title}`, href: context.nextLecture.href }] : []),
          home,
        ],
      };
    case 'back':
      if (context.page !== 'part') return notInLecture(context);
      if (context.previous) return { kind: 'navigate', href: context.previous.href };
      return {
        kind: 'message',
        text: 'Jste na začátku lekce.',
        suggestions: [
          ...(context.previousLecture
            ? [{ label: `Předchozí lekce: ${context.previousLecture.title}`, href: context.previousLecture.href }]
            : []),
          home,
        ],
      };
  }
}

/** `/open <number | number.part | id | words of the title>` */
function open(arg: string, lectures: LectureTarget[]): CommandResult {
  const all = lectures.map(lectureSuggestion);
  if (arg === '') {
    return { kind: 'message', text: 'Napište číslo nebo název lekce, například /open 1.', suggestions: all };
  }

  const query = fold(arg);
  const partReference = PART_REFERENCE.exec(query);
  if (/^\d+$/.test(query) || partReference) {
    const lectureNumber = Number(partReference ? partReference[1] : query);
    const lecture = lectures[lectureNumber - 1];
    if (!lecture) {
      return {
        kind: 'message',
        text: `Lekce ${lectureNumber} neexistuje. Kurz má ${count(lectures.length, 'lekci', 'lekce', 'lekcí')}.`,
        suggestions: all,
      };
    }
    if (!partReference || partReference[2] === '') return { kind: 'navigate', href: lecture.href };
    const part = lecture.parts[Number(partReference[2]) - 1];
    if (!part) {
      return {
        kind: 'message',
        text: `Lekce ${lecture.number} má jen ${count(lecture.parts.length, 'část', 'části', 'částí')}.`,
        suggestions: lecture.parts.map((candidate) => ({
          label: `${lecture.number}.${candidate.number} ${candidate.title}`,
          href: candidate.href,
        })),
      };
    }
    return { kind: 'navigate', href: part.href };
  }

  const exact = lectures.find((lecture) => lecture.id === query);
  if (exact) return { kind: 'navigate', href: exact.href };

  const matches = matchByTitle(query, lectures);
  if (matches.length === 1) return { kind: 'navigate', href: matches[0]!.href };
  const shown = arg.length > 40 ? `${arg.slice(0, 40)}…` : arg;
  return matches.length > 1
    ? { kind: 'message', text: `Výrazu „${shown}“ odpovídá více lekcí:`, suggestions: matches.map(lectureSuggestion) }
    : { kind: 'message', text: `Žádná lekce neodpovídá výrazu „${shown}“.`, suggestions: all };
}

/** `/course <number | id | words of the title>` */
function course(arg: string, context: CommandContext): CommandResult {
  const courses = context.courses ?? [];
  if (courses.length < 2) {
    return { kind: 'message', text: 'K dispozici je jen jeden kurz.', suggestions: [{ label: '/home', command: '/home' }] };
  }
  const current = currentCourseOf(context);
  const all = courses.map((candidate) => courseSuggestion(candidate, current));
  if (arg === '') {
    return { kind: 'message', text: 'Napište číslo nebo název kurzu, například /course 1.', suggestions: all };
  }

  const query = fold(arg);
  if (/^\d+$/.test(query)) {
    const target = courses[Number(query) - 1];
    if (!target) {
      return {
        kind: 'message',
        text: `Kurz ${Number(query)} neexistuje. K dispozici jsou ${count(courses.length, 'kurz', 'kurzy', 'kurzů')}.`,
        suggestions: all,
      };
    }
    return { kind: 'navigate', href: target.href };
  }

  const exact = courses.find((candidate) => candidate.id === query);
  if (exact) return { kind: 'navigate', href: exact.href };

  const matches = matchByTitle(query, courses);
  if (matches.length === 1) return { kind: 'navigate', href: matches[0]!.href };
  const shown = arg.length > 40 ? `${arg.slice(0, 40)}…` : arg;
  return matches.length > 1
    ? {
        kind: 'message',
        text: `Výrazu „${shown}“ odpovídá více kurzů:`,
        suggestions: matches.map((match) => courseSuggestion(match, current)),
      }
    : { kind: 'message', text: `Žádný kurz neodpovídá výrazu „${shown}“.`, suggestions: all };
}

/** Items whose title or id contains every word of the folded query. */
function matchByTitle<T extends { id: string; title: string }>(query: string, items: T[]): T[] {
  const words = query.split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const haystack = fold(`${item.title} ${item.id}`);
    return words.every((word) => haystack.includes(word));
  });
}

function notInLecture(context: CommandContext): CommandResult {
  return {
    kind: 'message',
    text: context.lectures.length > 0 ? 'Nejdřív otevřete lekci, například příkazem /open 1.' : 'Nejdřív otevřete lekci.',
    suggestions: context.lectures.length > 0 ? context.lectures.map(lectureSuggestion) : [{ label: '/home', command: '/home' }],
  };
}

function unknown(raw: string): CommandResult {
  const { word } = parse(raw);
  if (!raw.startsWith('/') && SHELL_WORDS.has(word)) {
    return {
      kind: 'message',
      text: 'Toto je navigace webu, ne terminál. Příkazy pro agenta a terminál pište ve svém terminálu.',
      suggestions: [{ label: '/help', command: '/help' }],
    };
  }
  const close = COMMANDS.filter((command) =>
    [command.name, ...command.aliases].some((name) => name.startsWith(word) || distance(name, word) <= 2),
  );
  const shown = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
  return {
    kind: 'message',
    text: `Neznámý příkaz „${shown}“.`,
    suggestions: [
      ...close.map((command) => ({ label: commandLabel(command.name), command: commandLabel(command.name) })),
      ...(close.some((command) => command.name === 'help') ? [] : [{ label: '/help', command: '/help' }]),
    ],
  };
}

function allSuggestions(): Suggestion[] {
  return COMMANDS.map((command) => ({ label: commandLabel(command.name), command: commandLabel(command.name) }));
}

export interface Completion {
  /** Text placed in the input (Tab) or run (Enter, click). */
  value: string;
  label: string;
  description: string;
}

/**
 * Suggestions while typing: command names, then lectures and parts after "/open ".
 * Commands that take an argument complete with a trailing space.
 */
export function completions(input: string, context: CommandContext): Completion[] {
  const text = input.trimStart();
  if (text === '') return [];
  const { word, arg } = parse(text);
  const hasArgument = /\s/.test(text);

  if (hasArgument) {
    const name = byWord(word)?.name;
    if (name === 'open') return lectureCompletions(arg, context.lectures);
    if (name === 'course') return courseCompletions(arg, context.courses ?? []);
    return [];
  }
  return COMMANDS.filter(
    (command) => command.name.startsWith(word) || command.aliases.some((alias) => alias.startsWith(word)),
  ).map((command) => ({
    value: command.examples ? `${commandLabel(command.name)} ` : commandLabel(command.name),
    label: commandLabel(command.name),
    description: command.description,
  }));
}

function courseCompletions(arg: string, courses: CourseTarget[]): Completion[] {
  const query = fold(arg);
  const candidates = courses.filter(
    (candidate) =>
      query === '' ||
      candidate.id.startsWith(query) ||
      String(candidate.number) === query ||
      matchByTitle(query, [candidate]).length > 0,
  );
  return candidates.map((candidate) => ({
    value: `/course ${candidate.id}`,
    label: `/course ${candidate.id}`,
    description: candidate.title,
  }));
}

function lectureCompletions(arg: string, lectures: LectureTarget[]): Completion[] {
  const query = fold(arg);
  const partReference = PART_REFERENCE.exec(query);
  if (partReference) {
    const lecture = lectures[Number(partReference[1]) - 1];
    return (lecture?.parts ?? [])
      .filter((part) => String(part.number).startsWith(partReference[2]!))
      .map((part) => ({
        value: `/open ${lecture!.number}.${part.number}`,
        label: `/open ${lecture!.number}.${part.number}`,
        description: part.title,
      }));
  }
  const candidates = /^\d+$/.test(query)
    ? lectures.filter((lecture) => String(lecture.number).startsWith(query))
    : matchByTitle(query, lectures);
  return candidates.map((lecture) => ({
    value: `/open ${lecture.number}`,
    label: `/open ${lecture.number}`,
    description: lecture.title,
  }));
}

/** Levenshtein distance, for "did you mean" suggestions. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previousDiagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previousDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      previousDiagonal = saved;
    }
  }
  return row[b.length]!;
}
