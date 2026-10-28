// The single Markdown dialect used for course content, response previews and admin views.
// CommonMark + GFM; content additionally supports front matter, `exercise` blocks and the
// `alternatives` directive. Raw HTML is never rendered, and output is always sanitized.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit, SKIP } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';
import { toString as toText } from 'mdast-util-to-string';
import type { Root, Parent, Nodes } from 'mdast';
import type { Element, Root as HastRoot } from 'hast';

export type MarkdownMode = 'content' | 'response';

export const EXERCISE_LANG = 'exercise';
export const ALTERNATIVES_DIRECTIVE = 'alternatives';
export const OPTION_DIRECTIVE = 'option';

const contentParser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']).use(remarkDirective);
const responseParser = unified().use(remarkParse).use(remarkGfm);

/** Parses Markdown into an mdast tree with source positions. */
export function parseMarkdown(source: string, mode: MarkdownMode): Root {
  return mode === 'content' ? contentParser.parse(source) : responseParser.parse(source);
}

export type ImageResolution = { src: string; width?: number; height?: number } | { missing: true };
export type LinkResolution = { href: string } | { missing: true };

export interface RenderOptions {
  mode: MarkdownMode;
  /**
   * Maps an authored image URL to what the browser receives. `undefined` leaves the URL
   * unchanged (e.g. external images); `{ missing: true }` renders a readable fallback.
   */
  resolveImage?: (url: string) => ImageResolution | undefined;
  /** Maps an authored link URL to its target, like `resolveImage` (e.g. downloadable files). */
  resolveLink?: (url: string) => LinkResolution | undefined;
  /** Demotes headings (e.g. 1: `#` becomes h2) so the page keeps a single h1. */
  shiftHeadings?: number;
  /** Removes a leading heading with this text, when the page already shows it as the title. */
  omitLeadingHeading?: string;
}

export type CodeKind = 'terminal' | 'prompt' | 'output' | 'text' | 'code';

const TERMINAL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'powershell', 'ps1', 'pwsh', 'cmd', 'bat']);
const TEXT_LANGS = new Set(['', 'text', 'txt', 'plaintext']);

/** Classifies a fenced code block by its language; see docs/content-contract.md. */
function codeKind(lang: string | null | undefined): { kind: CodeKind; label?: string } {
  const language = (lang ?? '').toLowerCase();
  if (TERMINAL_LANGS.has(language)) return { kind: 'terminal', label: 'Terminál' };
  if (language === 'prompt') return { kind: 'prompt', label: 'Prompt pro agenta' };
  if (language === 'output') return { kind: 'output', label: 'Výstup' };
  if (TEXT_LANGS.has(language)) return { kind: 'text' };
  return { kind: 'code', label: `Kód (${language})` };
}

const withoutClassName = (rules: NonNullable<SanitizeSchema['attributes']>[string] | undefined) =>
  (rules ?? []).filter((rule) => !(Array.isArray(rule) && rule[0] === 'className'));

const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'section'],
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...withoutClassName(defaultSchema.attributes?.div),
      ['className', 'exercise', 'alternatives', 'code-block'],
      'dataExerciseId',
      'dataKind',
    ],
    section: [
      ...withoutClassName(defaultSchema.attributes?.section),
      ['className', 'footnotes', 'alternative'],
      'dataLabel',
    ],
    span: [...withoutClassName(defaultSchema.attributes?.span), ['className', 'code-label', 'image-missing', 'file-missing']],
    p: [...withoutClassName(defaultSchema.attributes?.p), ['className', 'alternative-label']],
    img: [...(defaultSchema.attributes?.img ?? []), 'loading', 'decoding', 'width', 'height'],
  },
};

/** Renders Markdown to sanitized HTML. Never executes or passes through embedded HTML/scripts. */
export async function renderMarkdown(source: string, options: RenderOptions): Promise<string> {
  const tree = parseMarkdown(source, options.mode);
  transformTree(tree, source, options);
  const hast = await unified().use(remarkRehype).run(tree);
  const clean = await unified().use(rehypeSanitize, sanitizeSchema).run(hast);
  makeScrollAreasFocusable(clean);
  return unified().use(rehypeStringify).stringify(clean);
}

/** Code blocks and tables may scroll horizontally; keyboard users must be able to reach them. */
function makeScrollAreasFocusable(tree: HastRoot): void {
  visit(tree, 'element', (element: Element) => {
    if (element.tagName === 'pre' || element.tagName === 'table') element.properties.tabIndex = 0;
  });
}

function transformTree(tree: Root, source: string, options: RenderOptions): void {
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node) => {
    definitions.set(node.identifier, node.url);
  });

  const first = tree.children.find((child) => child.type !== 'yaml');
  if (first?.type === 'heading' && options.omitLeadingHeading !== undefined) {
    const text = toText(first).trim();
    if (text === options.omitLeadingHeading.trim()) tree.children.splice(tree.children.indexOf(first), 1);
  }

  visit(tree, (node: Nodes, index, parent: Parent | undefined) => {
    if (!parent || index === undefined) return;

    if (node.type === 'heading' && options.shiftHeadings) {
      node.depth = Math.min(6, node.depth + options.shiftHeadings) as typeof node.depth;
      return;
    }

    if (node.type === 'image' || node.type === 'imageReference') {
      const url = node.type === 'image' ? node.url : definitions.get(node.identifier);
      if (url === undefined) return;
      const resolution = options.resolveImage?.(url);
      if (resolution && 'missing' in resolution) {
        parent.children.splice(index, 1, {
          type: 'emphasis',
          children: [{ type: 'text', value: `[Obrázek není k dispozici: ${node.alt || url}]` }],
          data: { hName: 'span', hProperties: { className: ['image-missing'] } },
        } as never);
        return [SKIP, index + 1];
      }
      const size = resolution?.width && resolution.height ? { width: resolution.width, height: resolution.height } : {};
      const src = resolution?.src ?? url;
      const image = {
        type: 'image',
        url: src,
        alt: node.alt ?? '',
        data: { hProperties: { loading: 'lazy', decoding: 'async', ...size } },
      };
      // Without JavaScript the image links to the full-size file; the enlarge dialog enhances it.
      const replacement = resolution && parent.type !== 'link' ? { type: 'link', url: src, children: [image] } : image;
      parent.children.splice(index, 1, replacement as never);
      return [SKIP, index + 1];
    }

    if (node.type === 'link' || node.type === 'linkReference') {
      const url = node.type === 'link' ? node.url : definitions.get(node.identifier);
      const resolution = url === undefined ? undefined : options.resolveLink?.(url);
      if (!resolution) return;
      if ('missing' in resolution) {
        parent.children.splice(index, 1, {
          type: 'emphasis',
          children: [{ type: 'text', value: `[Soubor není k dispozici: ${toText(node) || url}]` }],
          data: { hName: 'span', hProperties: { className: ['file-missing'] } },
        } as never);
        return [SKIP, index + 1];
      }
      // Rewritten in place, so children (e.g. an image) are visited with a `link` parent.
      Object.assign(node, { type: 'link', url: resolution.href });
      return;
    }

    if (node.type === 'code' && !(options.mode === 'content' && node.lang === EXERCISE_LANG)) {
      const { kind, label } = codeKind(node.lang);
      parent.children.splice(index, 1, {
        type: 'paragraph',
        children: [
          ...(label
            ? [{ type: 'emphasis', children: [{ type: 'text', value: label }], data: { hName: 'span', hProperties: { className: ['code-label'] } } }]
            : []),
          node,
        ],
        data: { hName: 'div', hProperties: { className: ['code-block'], dataKind: kind } },
      } as never);
      return [SKIP, index + 1];
    }

    if (options.mode !== 'content') return;

    if (node.type === 'yaml') {
      parent.children.splice(index, 1);
      return [SKIP, index];
    }

    if (node.type === 'code' && node.lang === EXERCISE_LANG) {
      const id = exerciseIdOf(node.value);
      // Placeholder where the application mounts the "Moje odpověď" panel.
      parent.children.splice(index, 1, {
        type: 'paragraph',
        children: [],
        data: { hName: 'div', hProperties: { className: ['exercise'], dataExerciseId: id ?? '' } },
      });
      return [SKIP, index + 1];
    }

    if (node.type === 'containerDirective' && node.name === ALTERNATIVES_DIRECTIVE) {
      node.data = { hName: 'div', hProperties: { className: ['alternatives'] } };
      return;
    }

    if (node.type === 'containerDirective' && node.name === OPTION_DIRECTIVE && isAlternatives(parent)) {
      const label = node.attributes?.label ?? '';
      node.data = { hName: 'section', hProperties: { className: ['alternative'], dataLabel: label } };
      // Visible label without JavaScript; the tabs script hides it.
      node.children.unshift({
        type: 'paragraph',
        children: [{ type: 'strong', children: [{ type: 'text', value: label }] }],
        data: { hProperties: { className: ['alternative-label'] } },
      });
      return;
    }

    if (node.type === 'containerDirective' || node.type === 'leafDirective' || node.type === 'textDirective') {
      // Unknown directive (often accidental, e.g. "viz:soubor"): show the original text.
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      const value = start !== undefined && end !== undefined ? source.slice(start, end) : '';
      parent.children.splice(index, 1, { type: 'text', value } as never);
      return [SKIP, index + 1];
    }
  });
}

function isAlternatives(node: Parent): boolean {
  return node.type === 'containerDirective' && (node as { name?: string }).name === ALTERNATIVES_DIRECTIVE;
}

function exerciseIdOf(yamlSource: string): string | undefined {
  try {
    const data: unknown = parseYaml(yamlSource);
    if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'string') return data.id;
  } catch {
    // Reported by the validator.
  }
  return undefined;
}
