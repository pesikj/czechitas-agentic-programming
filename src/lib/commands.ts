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

interface Destination {
  title: string;
  href: string;
}

export type CommandContext =
  | { page: 'home'; lectures: LectureTarget[] }
  | {
      page: 'part';
      lectures: LectureTarget[];
      lectureNumber: number;
      previous?: Destination;
      next?: Destination;
      previousLecture?: LectureTarget;
      nextLecture?: LectureTarget;
    }
  | { page: 'other'; lectures: LectureTarget[] };

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

export type CommandName = 'next' | 'back' | 'open' | 'search' | 'home' | 'help';

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
      return { kind: 'navigate', href: '/' };
    case 'open':
      return open(arg, context.lectures);
    case 'search':
      return { kind: 'navigate', href: arg ? `/hledat?q=${encodeURIComponent(arg)}` : '/hledat' };
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

  const matches = matchLectures(query, lectures);
  if (matches.length === 1) return { kind: 'navigate', href: matches[0]!.href };
  const shown = arg.length > 40 ? `${arg.slice(0, 40)}…` : arg;
  return matches.length > 1
    ? { kind: 'message', text: `Výrazu „${shown}“ odpovídá více lekcí:`, suggestions: matches.map(lectureSuggestion) }
    : { kind: 'message', text: `Žádná lekce neodpovídá výrazu „${shown}“.`, suggestions: all };
}

/** Lectures whose title or id contains every word of the folded query. */
function matchLectures(query: string, lectures: LectureTarget[]): LectureTarget[] {
  const words = query.split(/\s+/).filter(Boolean);
  return lectures.filter((lecture) => {
    const haystack = fold(`${lecture.title} ${lecture.id}`);
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
    return byWord(word)?.name === 'open' ? lectureCompletions(arg, context.lectures) : [];
  }
  return COMMANDS.filter(
    (command) => command.name.startsWith(word) || command.aliases.some((alias) => alias.startsWith(word)),
  ).map((command) => ({
    value: command.examples ? `${commandLabel(command.name)} ` : commandLabel(command.name),
    label: commandLabel(command.name),
    description: command.description,
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
    : matchLectures(query, lectures);
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
