import {
  absDependencies,
  addDependencies,
  create,
  divideDependencies,
  eDependencies,
  multiplyDependencies,
  parseDependencies,
  piDependencies,
  powDependencies,
  sqrtDependencies,
  subtractDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  type MathNode,
} from 'mathjs/number';
import type { LineVerdict, MarkSchemeLine, NumericAnswerSpec } from '../db/types';

const { parse } = create({
  absDependencies,
  addDependencies,
  divideDependencies,
  eDependencies,
  multiplyDependencies,
  parseDependencies,
  piDependencies,
  powDependencies,
  sqrtDependencies,
  subtractDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
});

const DEFAULT_DRAWS = 8;
const COMPARISON_EPSILON = 1e-9;
/** Attempts allowed per requested draw before a comparison gives up as undetermined. */
const ATTEMPTS_PER_DRAW = 12;
/** Base sample magnitude before domain widening; see `sampleValue`. */
const BASE_MAGNITUDE_MIN = 0.25;
const BASE_MAGNITUDE_SPAN = 9.75;
const ALLOWED_FUNCTIONS = new Set(['abs', 'sqrt']);
const BUILT_IN_SYMBOLS = new Set(['e', 'pi']);
const ALLOWED_NODE_TYPES = new Set([
  'ConstantNode',
  'FunctionNode',
  'OperatorNode',
  'ParenthesisNode',
  'SymbolNode',
]);
const ALLOWED_OPERATORS = new Set(['+', '-', '*', '/', '^']);

export interface Expression {
  /** The learner-authored source, retained for previews and useful error reporting. */
  source: string;
  /** The validated mathjs tree. Equations are represented as `left - right`. */
  node: MathNode;
  /** Free variables in stable lexical order. */
  variables: string[];
}

export interface ExpressionParseError {
  message: string;
  /** One-based character position when mathjs reports one. */
  position?: number;
}

export type ParseExpressionResult =
  | { ok: true; expression: Expression }
  | { ok: false; error: ExpressionParseError };

/**
 * The result of a random-evaluation comparison. `undetermined` means the sampler could
 * not find enough points where both expressions evaluate to finite numbers — a
 * domain-restricted expression such as `sqrt(x - 100)`, not evidence of a difference.
 * Callers must not treat it as `different`: doing so marks a student wrong for writing
 * something the checker cannot check.
 */
export type EquivalenceOutcome = 'equivalent' | 'different' | 'undetermined';

export interface WorkingVerificationResult {
  marksEarned: number;
  marksAvailable: number;
  lineVerdicts: LineVerdict[];
  /** Lines the checker could not decide; they earn nothing but are not wrong answers. */
  undeterminedLines: number;
}

/**
 * Parse the deliberately small scalar-expression language used by Arc 11 items.
 * A single top-level `=` is treated as an equation and normalised to `left - right`;
 * assignments, collections and arbitrary mathjs function calls are rejected.
 */
export function parseExpression(text: string): ParseExpressionResult {
  const source = text.trim();
  if (!source) return parseFailure('Enter an expression.');

  try {
    const equation = splitEquation(source);
    const node = equation ? parse(`(${equation.left}) - (${equation.right})`) : parse(source);
    const validationError = validateNode(node);
    if (validationError) return parseFailure(validationError);

    const variables = freeVariables(node);
    return { ok: true, expression: { source, node, variables } };
  } catch (error) {
    return parseFailure(readParseMessage(error), readParsePosition(error));
  }
}

/** Render a validated expression as KaTeX input without exposing mathjs syntax to the UI. */
export function expressionToTex(expression: Expression): string {
  const equation = splitEquation(expression.source);
  if (!equation) return expression.node.toTex();
  return `${parse(equation.left).toTex()} = ${parse(equation.right).toTex()}`;
}

/**
 * Compare two expressions by evaluating them under the same deterministic random
 * substitutions. This is probabilistic identity testing, not symbolic algebra.
 *
 * Each variable draws its own sign, so every sign quadrant is reachable: deriving the
 * sign from the attempt index instead made `abs(x*y)` and `-x*y` look equivalent,
 * because the two variables could never share a sign. The sample magnitude widens as
 * attempts fail, which is what lets a domain-restricted expression such as
 * `sqrt(x - 100)` reach the region where it is defined at all.
 */
export function compareByRandomEvaluation(
  a: Expression,
  b: Expression,
  seed: string,
  draws = DEFAULT_DRAWS,
): EquivalenceOutcome {
  if (!Number.isInteger(draws) || draws < 1) return 'undetermined';

  const variables = [...new Set([...a.variables, ...b.variables])].sort();
  const evaluateA = a.node.compile();
  const evaluateB = b.node.compile();
  if (variables.length === 0) {
    const left = evaluateNumber(evaluateA, new Map());
    const right = evaluateNumber(evaluateB, new Map());
    if (left === null || right === null) return 'undetermined';
    return nearlyEqual(left, right) ? 'equivalent' : 'different';
  }

  const random = seededRandom(seed);
  const attemptLimit = draws * ATTEMPTS_PER_DRAW;
  let accepted = 0;
  for (let attempt = 0; attempt < attemptLimit && accepted < draws; attempt += 1) {
    const scope = new Map<string, number>();
    variables.forEach((variable) => {
      scope.set(variable, sampleValue(random, attempt, draws));
    });

    const left = evaluateNumber(evaluateA, scope);
    const right = evaluateNumber(evaluateB, scope);
    if (left === null || right === null) continue;
    if (!nearlyEqual(left, right)) return 'different';
    accepted += 1;
  }
  return accepted === draws ? 'equivalent' : 'undetermined';
}

/** Check a parsed scalar answer against an exact, tolerance or membership specification. */
export function checkNumeric(value: Expression, spec: NumericAnswerSpec): boolean {
  const actual = constantValue(value);
  if (actual === null) return false;

  if (spec.kind === 'exact') {
    const expected = parseConstant(spec.value);
    return expected !== null && nearlyEqual(actual, expected);
  }
  if (spec.kind === 'within') {
    const expected = parseConstant(spec.value);
    return (
      expected !== null &&
      Number.isFinite(spec.tolerance) &&
      spec.tolerance >= 0 &&
      Math.abs(actual - expected) <= spec.tolerance + COMPARISON_EPSILON
    );
  }
  return spec.values.some((candidate) => {
    const expected = parseConstant(candidate);
    return expected !== null && nearlyEqual(actual, expected);
  });
}

/**
 * Mark student working against outstanding scheme lines. Both student and scheme
 * order are tolerated; a scheme line can earn marks at most once.
 *
 * A line that matches nothing is only a miss when every comparison reached a verdict.
 * If any comparison came back undetermined the line is recorded as such: it earns no
 * marks, but it is not the student's mistake and the study face says so rather than
 * showing a red zero.
 */
export function verifyWorkingLines(
  studentLines: string[],
  scheme: MarkSchemeLine[],
  seed: string,
): WorkingVerificationResult {
  const unmatched = new Set(scheme.map((_, index) => index));
  const lineVerdicts: LineVerdict[] = [];
  let marksEarned = 0;
  let undeterminedLines = 0;

  studentLines.forEach((studentLine, studentIndex) => {
    let matchedLineIndex: number | null = null;
    let sawUndetermined = false;
    const checkerSeeds: string[] = [];
    for (const schemeIndex of unmatched) {
      const checkerSeed = `${seed}:${studentIndex}:${schemeIndex}`;
      if (usesRandomEvaluation(scheme[schemeIndex])) checkerSeeds.push(checkerSeed);
      const outcome = matchesSchemeLine(studentLine, scheme[schemeIndex], checkerSeed);
      if (outcome === 'undetermined') sawUndetermined = true;
      if (outcome === 'matched') {
        matchedLineIndex = schemeIndex;
        unmatched.delete(schemeIndex);
        break;
      }
    }

    const marks = matchedLineIndex === null ? 0 : validMarks(scheme[matchedLineIndex].marks);
    marksEarned += marks;
    const undetermined = matchedLineIndex === null && sawUndetermined;
    if (undetermined) undeterminedLines += 1;
    lineVerdicts.push({
      studentLine,
      matchedLineIndex,
      marksEarned: marks,
      checkerSeeds,
      ...(undetermined ? { undetermined: true as const } : {}),
    });
  });

  return {
    marksEarned,
    marksAvailable: scheme.reduce((total, line) => total + validMarks(line.marks), 0),
    lineVerdicts,
    undeterminedLines,
  };
}

function usesRandomEvaluation(line: MarkSchemeLine): boolean {
  return line.kind === 'waypoint' || (line.kind === 'predicate' && line.predicate === 'equals');
}

type SchemeLineOutcome = 'matched' | 'unmatched' | 'undetermined';

/**
 * A scheme line the compiler let through can still be unusable at study time — an
 * expression that no longer parses, or a comparison whose domain defeats the sampler.
 * Those are author-side failures, so they return `undetermined` rather than reporting
 * the student's line as a miss.
 */
function matchesSchemeLine(
  studentLine: string,
  line: MarkSchemeLine,
  seed: string,
): SchemeLineOutcome {
  if (line.kind === 'predicate' && line.predicate === 'contains') {
    const needle = line.args?.[0]?.trim().toLocaleLowerCase();
    if (!needle) return 'undetermined';
    return studentLine.toLocaleLowerCase().includes(needle) ? 'matched' : 'unmatched';
  }

  const parsedStudent = parseExpression(studentLine);
  if (!parsedStudent.ok) return 'unmatched';

  if (line.kind === 'waypoint') {
    const expected = parseExpression(line.expression);
    if (!expected.ok) return 'undetermined';
    return fromOutcome(
      compareByRandomEvaluation(parsedStudent.expression, expected.expression, seed),
    );
  }

  const args = line.args ?? [];
  if (line.predicate === 'equals') {
    const expected = args[0] ? parseExpression(args[0]) : null;
    if (!expected?.ok) return 'undetermined';
    return fromOutcome(
      compareByRandomEvaluation(parsedStudent.expression, expected.expression, seed),
    );
  }
  if (line.predicate === 'within') {
    const tolerance = Number(args[0]);
    if (args[1] === undefined || !Number.isFinite(tolerance) || tolerance < 0) {
      return 'undetermined';
    }
    return checkNumeric(parsedStudent.expression, {
      kind: 'within',
      value: args[1],
      tolerance,
    })
      ? 'matched'
      : 'unmatched';
  }
  if (args.length === 0) return 'undetermined';
  return checkNumeric(parsedStudent.expression, { kind: 'matches-one-of', values: args })
    ? 'matched'
    : 'unmatched';
}

function fromOutcome(outcome: EquivalenceOutcome): SchemeLineOutcome {
  if (outcome === 'equivalent') return 'matched';
  return outcome === 'different' ? 'unmatched' : 'undetermined';
}

function splitEquation(source: string): { left: string; right: string } | null {
  let depth = 0;
  let equalsAt = -1;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    if (depth < 0) throw new Error('There is a closing bracket without an opening bracket.');

    if (character === '=' && depth === 0) {
      if (source[index - 1] === '<' || source[index - 1] === '>' || source[index - 1] === '!') {
        throw new Error('Comparisons are not supported here.');
      }
      if (source[index + 1] === '=') throw new Error('Use a single = for an equation.');
      if (equalsAt !== -1) throw new Error('Use only one = in an equation.');
      equalsAt = index;
    }
  }
  if (depth !== 0) throw new Error('The brackets do not match.');
  if (equalsAt === -1) return null;

  const left = source.slice(0, equalsAt).trim();
  const right = source.slice(equalsAt + 1).trim();
  if (!left || !right) throw new Error('Write an expression on both sides of =.');
  return { left, right };
}

function validateNode(root: MathNode): string | null {
  let error: string | null = null;
  root.traverse((node) => {
    if (error) return;
    if (!ALLOWED_NODE_TYPES.has(node.type)) {
      error = `${node.type.replace(/Node$/, '')} expressions are not supported.`;
      return;
    }
    if (node.type === 'OperatorNode') {
      const operator = (node as MathNode & { op: string }).op;
      if (!ALLOWED_OPERATORS.has(operator)) error = `The ${operator} operator is not supported.`;
    }
    if (node.type === 'FunctionNode') {
      const name = (node as MathNode & { fn: { name?: string } }).fn.name;
      if (!name || !ALLOWED_FUNCTIONS.has(name)) {
        error = `The ${name ?? 'requested'} function is not supported.`;
      }
    }
  });
  return error;
}

function freeVariables(root: MathNode): string[] {
  const variables = new Set<string>();
  root.traverse((node, _path, parent) => {
    if (node.type !== 'SymbolNode') return;
    const name = (node as MathNode & { name: string }).name;
    const isFunctionName =
      parent?.type === 'FunctionNode' && (parent as MathNode & { fn: MathNode }).fn === node;
    if (!isFunctionName && !BUILT_IN_SYMBOLS.has(name)) variables.add(name);
  });
  return [...variables].sort();
}

function constantValue(expression: Expression): number | null {
  if (expression.variables.length > 0) return null;
  return evaluateNumber(expression.node.compile(), new Map());
}

function parseConstant(source: string): number | null {
  const parsed = parseExpression(source);
  return parsed.ok ? constantValue(parsed.expression) : null;
}

function evaluateNumber(
  compiled: { evaluate(scope?: Map<string, number>): unknown },
  scope: Map<string, number>,
): number | null {
  try {
    const value = compiled.evaluate(scope);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function nearlyEqual(left: number, right: number): boolean {
  return (
    Math.abs(left - right) <= COMPARISON_EPSILON * Math.max(1, Math.abs(left), Math.abs(right))
  );
}

function validMarks(marks: number): number {
  return Number.isFinite(marks) && marks > 0 ? marks : 0;
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw one substitution value. Sign is independent per variable, and magnitude doubles
 * every `draws` failed attempts so that expressions defined only far from the origin
 * still get sampled inside their domain before the attempt budget runs out.
 */
function sampleValue(random: () => number, attempt: number, draws: number): number {
  const widening = 2 ** Math.floor(attempt / draws);
  const magnitude = (BASE_MAGNITUDE_MIN + random() * BASE_MAGNITUDE_SPAN) * widening;
  return random() < 0.5 ? -magnitude : magnitude;
}

function parseFailure(message: string, position?: number): ParseExpressionResult {
  return { ok: false, error: position === undefined ? { message } : { message, position } };
}

function readParseMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/ \(char \d+\)$/, '')
    : 'Invalid expression.';
}

function readParsePosition(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const match = error.message.match(/\(char (\d+)\)$/);
  return match ? Number(match[1]) : undefined;
}
