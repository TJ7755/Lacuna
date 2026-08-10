import type { MarkSchemeLine } from '../db/types';
import { parseExpression } from './verify';

export const MARK_SCHEME_PREDICATES = [
  'equals',
  'within',
  'matches-one-of',
  'contains',
] as const;
export type PredicateName = (typeof MARK_SCHEME_PREDICATES)[number];

/** Canonical examples shared by the compiler UI and clipboard authoring prompts. */
export const MARK_SCHEME_SYNTAX_EXAMPLES = [
  '[1] substitution :: 2x = 8',
  '[1] answer :: equals :: 4',
  '[1] check :: within 0.01 :: 4.0',
  '[1] choice :: matches-one-of :: 3 :: 4 :: 5',
  '[1] method :: contains :: substitution',
] as const;

/** The authoring syntax description lives beside the grammar so prompt copy cannot drift. */
export function markSchemeSyntaxSpecification(): string {
  return [
    'Write one nonblank criterion per line.',
    'Each line has the form: [positive whole marks] optional label :: check',
    'A check is either a mathematical waypoint expression or one of the predicates below.',
    `Predicate vocabulary: ${MARK_SCHEME_PREDICATES.join(', ')}.`,
    'Canonical examples:',
    ...MARK_SCHEME_SYNTAX_EXAMPLES.map((example) => `- ${example}`),
  ].join('\n');
}

export interface CompiledMarkSchemeLine {
  kind: 'compiled';
  /** One-based source line number. */
  lineNumber: number;
  source: string;
  value: MarkSchemeLine;
}

export interface MarkSchemeCompileError {
  kind: 'error';
  /** One-based source line number. */
  lineNumber: number;
  source: string;
  /** One-based character position for an editor underline. */
  column: number;
  /** Number of source characters to underline. */
  length: number;
  message: string;
}

export type MarkSchemeCompileEntry = CompiledMarkSchemeLine | MarkSchemeCompileError;

export interface MarkSchemeCompileResult {
  /** Nonblank source lines, preserved in source order as either a value or an error. */
  lines: MarkSchemeCompileEntry[];
  /** Marks from successfully compiled lines only. */
  totalMarks: number;
}

/** Compile tutor-authored mark-scheme text without allowing one bad line to poison its neighbours. */
export function compileMarkScheme(source: string): MarkSchemeCompileResult {
  const lines: MarkSchemeCompileEntry[] = [];
  let totalMarks = 0;

  source.split(/\r?\n/).forEach((rawLine, index) => {
    if (!rawLine.trim()) return;
    const compiled = compileLine(rawLine, index + 1);
    lines.push(compiled);
    if (compiled.kind === 'compiled') totalMarks += compiled.value.marks;
  });

  return { lines, totalMarks };
}

/** Render a compiled criterion in the plain English used by the live authoring preview. */
export function renderLineAsEnglish(line: MarkSchemeLine): string {
  const prefix = [markLabel(line.marks), line.label].filter(Boolean).join(' — ');
  if (line.kind === 'waypoint') {
    return `${prefix} — any line equivalent to ${line.expression}`;
  }

  const args = line.args ?? [];
  if (line.predicate === 'equals') return `${prefix} — equals ${args[0]}`;
  if (line.predicate === 'within') {
    return `${prefix} — within ${args[0]} of ${args[1]}`;
  }
  if (line.predicate === 'matches-one-of') {
    return `${prefix} — matches one of ${formatList(args)}`;
  }
  return `${prefix} — contains “${args[0]}”`;
}

/** Rebuild the canonical editable source for a persisted compiled scheme. */
export function serialiseMarkScheme(scheme: MarkSchemeLine[]): string {
  return scheme
    .map((line) => {
      const prefix = `[${line.marks}]${line.label ? ` ${line.label}` : ''} :: `;
      if (line.kind === 'waypoint') return `${prefix}${line.expression}`;
      if (line.predicate === 'within') {
        return `${prefix}within ${line.args?.[0] ?? ''} :: ${line.args?.[1] ?? ''}`;
      }
      return `${prefix}${line.predicate} :: ${(line.args ?? []).join(' :: ')}`;
    })
    .join('\n');
}

function compileLine(source: string, lineNumber: number): MarkSchemeCompileEntry {
  const marksMatch = source.match(/^\s*\[([^\]]*)\]/);
  if (!marksMatch) {
    return failure(
      source,
      lineNumber,
      firstContentColumn(source),
      Math.max(1, source.trim().split(/\s/)[0]?.length ?? 1),
      'Start the line with marks in brackets, for example [1].',
    );
  }

  const marksText = marksMatch[1].trim();
  const marks = Number(marksText);
  if (!/^\d+$/.test(marksText) || !Number.isSafeInteger(marks) || marks <= 0) {
    return failure(
      source,
      lineNumber,
      source.indexOf('[') + 2,
      Math.max(1, marksMatch[1].length),
      'Marks must be a positive whole number.',
    );
  }

  const afterMarks = source.slice(marksMatch[0].length);
  const separatorAt = afterMarks.indexOf('::');
  if (separatorAt === -1) {
    return failure(
      source,
      lineNumber,
      marksMatch[0].length + firstContentColumn(afterMarks),
      Math.max(1, afterMarks.trim().length),
      'Add :: between the criterion label and its check.',
    );
  }

  const label = afterMarks.slice(0, separatorAt).trim() || undefined;
  const body = afterMarks.slice(separatorAt + 2).trim();
  const bodyColumn = source.indexOf(body, marksMatch[0].length + separatorAt + 2) + 1;
  if (!body) {
    return failure(
      source,
      lineNumber,
      source.length + 1,
      1,
      'Add an expression or predicate after ::.',
    );
  }

  const value = compileBody(body, marks, label, source, lineNumber, bodyColumn);
  return 'kind' in value && value.kind === 'error'
    ? value
    : { kind: 'compiled', lineNumber, source, value };
}

function compileBody(
  body: string,
  marks: number,
  label: string | undefined,
  source: string,
  lineNumber: number,
  bodyColumn: number,
): MarkSchemeLine | MarkSchemeCompileError {
  const parts = body.split(/\s*::\s*/);
  const headTokens = parts[0].trim().split(/\s+/);
  const candidate = headTokens[0].toLocaleLowerCase();
  const predicate = MARK_SCHEME_PREDICATES.find((name) => name === candidate);

  if (!predicate && parts.length > 1) {
    const suggestion = nearestPredicate(candidate);
    return failure(
      source,
      lineNumber,
      bodyColumn,
      candidate.length,
      suggestion
        ? `I don't recognise '${candidate}' — did you mean '${suggestion}'?`
        : `I don't recognise the predicate '${candidate}'.`,
    );
  }

  if (predicate) {
    return compilePredicate(
      predicate,
      headTokens.slice(1),
      parts.slice(1),
      marks,
      label,
      source,
      lineNumber,
      bodyColumn,
    );
  }

  const expression = parseExpression(body);
  if (!expression.ok) {
    return failure(
      source,
      lineNumber,
      bodyColumn + (expression.error.position ?? 1) - 1,
      1,
      expression.error.message,
    );
  }
  return { marks, label, kind: 'waypoint', expression: body };
}

function compilePredicate(
  predicate: PredicateName,
  inlineArgs: string[],
  remainingParts: string[],
  marks: number,
  label: string | undefined,
  source: string,
  lineNumber: number,
  bodyColumn: number,
): MarkSchemeLine | MarkSchemeCompileError {
  if (predicate === 'within') {
    if (inlineArgs.length !== 1 || remainingParts.length !== 1) {
      return predicateUsageError(source, lineNumber, bodyColumn, 'within 0.01 :: 4.0');
    }
    const tolerance = Number(inlineArgs[0]);
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      return failure(
        source,
        lineNumber,
        bodyColumn + predicate.length + 1,
        Math.max(1, inlineArgs[0].length),
        'The tolerance must be zero or a positive number.',
      );
    }
    const invalid = validateConstantArgument(
      remainingParts[0],
      source,
      lineNumber,
      source.lastIndexOf(remainingParts[0]) + 1,
    );
    if (invalid) return invalid;
    return {
      marks,
      label,
      kind: 'predicate',
      predicate,
      args: [inlineArgs[0], remainingParts[0]],
    };
  }

  if (inlineArgs.length > 0) {
    return predicateUsageError(source, lineNumber, bodyColumn, `${predicate} :: value`);
  }
  if (remainingParts.length === 0 || remainingParts.some((part) => !part.trim())) {
    return predicateUsageError(source, lineNumber, bodyColumn, `${predicate} :: value`);
  }

  if (predicate === 'equals') {
    if (remainingParts.length !== 1) {
      return predicateUsageError(source, lineNumber, bodyColumn, 'equals :: expression');
    }
    const parsed = parseExpression(remainingParts[0]);
    if (!parsed.ok) {
      return argumentParseError(parsed.error.message, source, lineNumber, remainingParts[0]);
    }
  } else if (predicate === 'matches-one-of') {
    for (const value of remainingParts) {
      const invalid = validateConstantArgument(
        value,
        source,
        lineNumber,
        source.indexOf(value) + 1,
      );
      if (invalid) return invalid;
    }
  } else if (remainingParts.length !== 1) {
    return predicateUsageError(source, lineNumber, bodyColumn, 'contains :: text');
  }

  return {
    marks,
    label,
    kind: 'predicate',
    predicate,
    args: remainingParts,
  };
}

function validateConstantArgument(
  value: string,
  source: string,
  lineNumber: number,
  column: number,
): MarkSchemeCompileError | null {
  const parsed = parseExpression(value);
  if (!parsed.ok) return argumentParseError(parsed.error.message, source, lineNumber, value);
  if (parsed.expression.variables.length > 0) {
    return failure(
      source,
      lineNumber,
      column,
      Math.max(1, value.length),
      'This predicate needs a numeric value without variables.',
    );
  }
  return null;
}

function argumentParseError(
  message: string,
  source: string,
  lineNumber: number,
  value: string,
): MarkSchemeCompileError {
  return failure(
    source,
    lineNumber,
    source.lastIndexOf(value) + 1,
    Math.max(1, value.length),
    message,
  );
}

function predicateUsageError(
  source: string,
  lineNumber: number,
  column: number,
  example: string,
): MarkSchemeCompileError {
  return failure(
    source,
    lineNumber,
    column,
    Math.max(1, source.length - column + 1),
    `Use the form ${example}.`,
  );
}

function failure(
  source: string,
  lineNumber: number,
  column: number,
  length: number,
  message: string,
): MarkSchemeCompileError {
  return {
    kind: 'error',
    lineNumber,
    source,
    column: Math.max(1, column),
    length: Math.max(1, length),
    message,
  };
}

function nearestPredicate(candidate: string): PredicateName | null {
  let best: { name: PredicateName; distance: number } | null = null;
  for (const name of MARK_SCHEME_PREDICATES) {
    const distance = editDistance(candidate, name);
    if (!best || distance < best.distance) best = { name, distance };
  }
  if (!best) return null;
  const threshold = best.name.length > 8 ? 3 : 2;
  return best.distance <= threshold ? best.name : null;
}

/** Predicate names relevant to the token currently being authored, closest match first. */
export function suggestMarkSchemePredicates(candidate: string): PredicateName[] {
  const normalised = candidate.trim().toLocaleLowerCase();
  if (!normalised) return [...MARK_SCHEME_PREDICATES];
  const prefixMatches = MARK_SCHEME_PREDICATES.filter((name) => name.startsWith(normalised));
  if (prefixMatches.length > 0) return prefixMatches;
  const nearest = nearestPredicate(normalised);
  return nearest ? [nearest] : [];
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function markLabel(marks: number): string {
  return `${marks} ${marks === 1 ? 'mark' : 'marks'}`;
}

function formatList(values: string[]): string {
  if (values.length < 2) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
}

function firstContentColumn(source: string): number {
  const index = source.search(/\S/);
  return index === -1 ? 1 : index + 1;
}
