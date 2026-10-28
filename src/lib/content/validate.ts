// Schemas and helpers for validating content-repository files. See docs/content-contract.md.
import { z } from 'zod';
import { LineCounter, parseDocument, isNode, type Document } from 'yaml';
import type { IssueCode, Severity, ValidationIssue } from './types';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

/** Files learners can download through ordinary links (data, code, archives). */
export const FILE_EXTENSIONS = new Set([
  '.csv', '.tsv', '.json', '.xml', '.yaml', '.yml', '.txt', '.md', '.xlsx', '.xls', '.parquet',
  '.py', '.ipynb', '.js', '.ts', '.sql', '.sh', '.ps1', '.zip', '.pdf',
]);

const nonEmpty = z.string().trim().min(1);

export type TocEntryInput = { lecture: string } | { title: string; items: TocEntryInput[] };

const tocEntrySchema: z.ZodType<TocEntryInput> = z.lazy(() =>
  z.union([
    z.strictObject({ lecture: nonEmpty }),
    z.strictObject({ title: nonEmpty, items: z.array(tocEntrySchema).min(1) }),
  ]),
);

export const courseSchema = z.strictObject({
  title: nonEmpty,
  toc: z.array(tocEntrySchema).min(1),
});

export const lectureSchema = z.strictObject({
  id: nonEmpty,
  title: nonEmpty,
  /** Readable without signing in. */
  public: z.boolean().optional(),
  parts: z.array(nonEmpty).min(1),
});

export const partFrontMatterSchema = z.strictObject({
  id: nonEmpty,
  title: nonEmpty,
});

export const exerciseSchema = z.strictObject({
  id: nonEmpty,
  revision: z.number().int().positive(),
  title: nonEmpty.optional(),
  fields: z
    .array(
      z.strictObject({
        id: nonEmpty,
        label: nonEmpty,
        guidance: nonEmpty.optional(),
      }),
    )
    .min(1),
});

export class IssueCollector {
  readonly issues: ValidationIssue[] = [];

  add(severity: Severity, code: IssueCode, file: string, message: string, line?: number): void {
    this.issues.push({ severity, code, file, message, ...(line !== undefined ? { line } : {}) });
  }

  error(code: IssueCode, file: string, message: string, line?: number): void {
    this.add('error', code, file, message, line);
  }

  warning(code: IssueCode, file: string, message: string, line?: number): void {
    this.add('warning', code, file, message, line);
  }

  get hasErrors(): boolean {
    return this.issues.some((issue) => issue.severity === 'error');
  }
}

export interface ParsedYaml {
  data: unknown;
  /** Returns the 1-based line of the value at `path`, offset by `baseLine`. */
  lineOf(path: readonly PropertyKey[]): number | undefined;
}

/**
 * Parses YAML, reporting syntax errors. `baseLine` is the line in the file where the YAML
 * starts minus one (for YAML embedded in Markdown).
 */
export function parseYamlWithLines(
  source: string,
  file: string,
  issues: IssueCollector,
  code: IssueCode,
  baseLine = 0,
): ParsedYaml | undefined {
  const lineCounter = new LineCounter();
  const doc: Document = parseDocument(source, { lineCounter, prettyErrors: false });
  if (doc.errors.length > 0) {
    for (const error of doc.errors) {
      const line = lineCounter.linePos(error.pos[0]).line + baseLine;
      issues.error(code, file, `Invalid YAML: ${error.message.split('\n')[0]}`, line);
    }
    return undefined;
  }
  return {
    data: doc.toJS(),
    lineOf(path) {
      for (let depth = path.length; depth >= 0; depth--) {
        const node = depth === 0 ? doc.contents : doc.getIn(path.slice(0, depth) as unknown[], true);
        if (isNode(node) && node.range) return lineCounter.linePos(node.range[0]).line + baseLine;
      }
      return undefined;
    },
  };
}

/** Validates data against a schema, reporting each problem with its line. */
export function checkSchema<T>(
  schema: z.ZodType<T>,
  parsed: ParsedYaml,
  file: string,
  issues: IssueCollector,
  code: IssueCode,
): T | undefined {
  const result = schema.safeParse(parsed.data);
  if (result.success) return result.data;
  for (const problem of result.error.issues) {
    const where = problem.path.length > 0 ? `${problem.path.join('.')}: ` : '';
    issues.error(code, file, `${where}${problem.message}`, parsed.lineOf(problem.path));
  }
  return undefined;
}

export function checkId(id: string, kind: string, file: string, issues: IssueCollector, line?: number): void {
  if (!ID_PATTERN.test(id)) {
    issues.error(
      'id-invalid',
      file,
      `${kind} id "${id}" must use only lowercase letters without diacritics, digits and single hyphens (e.g. "nazev-lekce").`,
      line,
    );
  }
}
