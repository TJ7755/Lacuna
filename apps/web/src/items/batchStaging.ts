import type { ItemFixture, ItemPayload, NumericAnswerSpec } from '../db/types';
import { compileMarkScheme } from './markSchemeCompiler';
import { numericAnswerSpecIsValid } from './numericAnswerSpec';
import { runWorkingFixtures } from './fixtureRunner';
import { normaliseConceptName } from '../questions/concepts';
import { BATCH_OUTPUT_END, BATCH_OUTPUT_START } from './prompts';

export interface BatchCandidate {
  id: string;
  index: number;
  raw: unknown;
  sourceJson: string;
  kind: 'numeric' | 'working' | null;
  question: string;
  explanation: string;
  targetConcept: string;
  prerequisiteConcepts: string[];
  errors: string[];
  payload?: Extract<ItemPayload, { kind: 'numeric' | 'working' }>;
  fixtureStatus: { total: number; passed: number } | null;
}

export interface BatchParseResult {
  candidates: BatchCandidate[];
  error: string | null;
}

/**
 * The JSON between the versioned delimiters, or null when the block is not present.
 *
 * Models routinely close the block by mirroring the opening delimiter rather than copying the
 * closing one (observed on free-tier output during the Arc 11 authoring trials). A second
 * opening token is an unambiguous terminator, since the block is already open by then, and the
 * closing delimiter does not contain the opening one as a substring. A correct closing
 * delimiter still wins when both are present.
 *
 * `lenient` additionally accepts a block with no terminator at all. That is safe only when the
 * caller already knows how many items it expects — reading a revision — and not when
 * discovering a whole batch, where trailing commentary would be swallowed into the JSON.
 */
function extractDelimitedBlock(source: string, lenient = false): string | null {
  const start = source.indexOf(BATCH_OUTPUT_START);
  if (start === -1) return null;

  const afterStart = start + BATCH_OUTPUT_START.length;
  const end = source.indexOf(BATCH_OUTPUT_END, afterStart);
  const mirrored = source.indexOf(BATCH_OUTPUT_START, afterStart);
  const terminator = end === -1 ? mirrored : end;
  if (terminator === -1) return lenient ? source.slice(afterStart).trim() : null;
  return source.slice(afterStart, terminator).trim();
}

export function parseBatchOutput(source: string): BatchParseResult {
  const json = extractDelimitedBlock(source);
  if (json === null) {
    return {
      candidates: [],
      error: `Paste the complete block from ${BATCH_OUTPUT_START} to ${BATCH_OUTPUT_END}.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      candidates: [],
      error: `The batch JSON is invalid: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }

  if (!isRecord(parsed) || parsed.version !== 2 || !Array.isArray(parsed.items)) {
    return { candidates: [], error: 'The batch must contain version 2 and an items array.' };
  }
  if (parsed.items.length === 0) {
    return { candidates: [], error: 'The batch contains no items.' };
  }

  return {
    candidates: parsed.items.map((item, index) => validateBatchCandidate(item, index)),
    error: null,
  };
}

export interface RevisedItemsResult {
  items: unknown[];
  error: string | null;
}

/**
 * Read revised items back out of a model response.
 *
 * The revision prompts ask for the same delimited block the batch prompt uses, but a response
 * that drops the delimiters, returns a bare array, or returns a single bare item is still
 * unambiguous — and the tutor already knows which items they asked about. Rejecting those
 * shapes would leave them hand-editing JSON, which is the friction the revision loop exists to
 * remove. Validation is unchanged: every item still goes through `parseEditedCandidate`.
 */
export function parseRevisedItems(source: string): RevisedItemsResult {
  const trimmed = source.trim();
  if (!trimmed) return { items: [], error: 'Paste the revised item first.' };

  const json = extractDelimitedBlock(trimmed, true) ?? trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      items: [],
      error: `The revised JSON is invalid: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }

  const items = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.items)
      ? parsed.items
      : isRecord(parsed)
        ? [parsed]
        : null;
  if (!items) return { items: [], error: 'The response is not an item or a list of items.' };
  if (items.length === 0) return { items: [], error: 'The response contains no items.' };
  return { items, error: null };
}

export function parseEditedCandidate(sourceJson: string, index: number): BatchCandidate {
  try {
    return validateBatchCandidate(JSON.parse(sourceJson), index, sourceJson);
  } catch (error) {
    return {
      id: candidateId(index),
      index,
      raw: null,
      sourceJson,
      kind: null,
      question: '',
      explanation: '',
      targetConcept: '',
      prerequisiteConcepts: [],
      errors: [
        `The item JSON is invalid: ${error instanceof Error ? error.message : 'unknown error'}`,
      ],
      fixtureStatus: null,
    };
  }
}

function validateBatchCandidate(
  raw: unknown,
  index: number,
  sourceJson = JSON.stringify(raw, null, 2),
): BatchCandidate {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return {
      id: candidateId(index),
      index,
      raw,
      sourceJson,
      kind: null,
      question: '',
      explanation: '',
      targetConcept: '',
      prerequisiteConcepts: [],
      errors: [...errors, 'The item must be a JSON object.'],
      fixtureStatus: null,
    };
  }

  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question) errors.push('Add a non-empty question.');
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : '';
  if (!explanation) errors.push('Add a worked explanation.');
  const targetConcept =
    typeof raw.targetConcept === 'string' ? raw.targetConcept.trim().replace(/\s+/g, ' ') : '';
  if (!targetConcept) errors.push('Add one primary target Concept.');
  const prerequisiteConcepts = parseConceptNames(raw.prerequisiteConcepts, errors);
  if (
    targetConcept &&
    prerequisiteConcepts.some(
      (concept) => normaliseConceptName(concept) === normaliseConceptName(targetConcept),
    )
  ) {
    errors.push('The target Concept cannot also be a prerequisite.');
  }
  const kind = raw.kind === 'numeric' || raw.kind === 'working' ? raw.kind : null;
  if (!kind) errors.push("Question kind must be 'numeric' or 'working'.");

  let payload: BatchCandidate['payload'];
  let fixtureStatus: BatchCandidate['fixtureStatus'] = null;

  if (kind === 'numeric') {
    if (!numericAnswerSpecIsValid(raw.answer)) {
      errors.push('The numeric answer specification is invalid.');
    } else {
      payload = { v: 1, kind: 'numeric', answer: raw.answer as NumericAnswerSpec };
    }
    if (raw.fixtures !== undefined) {
      errors.push('Numeric batch Questions do not support fixtures yet.');
    }
  } else if (kind === 'working') {
    const schemeSource = typeof raw.scheme === 'string' ? raw.scheme : '';
    if (!schemeSource.trim()) errors.push('Add a mark scheme.');
    const compilation = compileMarkScheme(schemeSource);
    for (const entry of compilation.lines) {
      if (entry.kind === 'error') errors.push(`Scheme line ${entry.lineNumber}: ${entry.message}`);
    }
    const scheme = compilation.lines.flatMap((entry) =>
      entry.kind === 'compiled' ? [entry.value] : [],
    );
    const schemeIsValid = compilation.lines.every((entry) => entry.kind === 'compiled');
    const fixtureResult = parseFixtures(
      raw.fixtures,
      index,
      schemeIsValid ? compilation.totalMarks : null,
    );
    errors.push(...fixtureResult.errors);

    // Only report a fixture tally once the scheme compiles. Reporting "0 of N pass"
    // for an uncompilable scheme blames the fixtures for a scheme error.
    if (scheme.length > 0 && schemeIsValid) {
      const runs = runWorkingFixtures(scheme, fixtureResult.fixtures);
      fixtureStatus = {
        total: fixtureResult.fixtures.length,
        passed: runs.filter((run) => run.passes).length,
      };
      runs.forEach((run, fixtureIndex) => {
        if (!run.passes) {
          errors.push(
            `Fixture ${fixtureIndex + 1} expected ${run.fixture.expectedMarks} marks but received ${run.marksEarned}.`,
          );
        }
      });
      if (fixtureResult.errors.length === 0) {
        payload = {
          v: 1,
          kind: 'working',
          scheme,
          fixtures: fixtureResult.fixtures,
        };
      }
    }
  }

  if (errors.length > 0) payload = undefined;
  return {
    id: candidateId(index),
    index,
    raw,
    sourceJson,
    kind,
    question,
    explanation,
    targetConcept,
    prerequisiteConcepts,
    errors,
    payload,
    fixtureStatus,
  };
}

function parseConceptNames(raw: unknown, errors: string[]): string[] {
  if (raw === undefined) {
    errors.push('Add prerequisite Concepts as a list, using [] when there are none.');
    return [];
  }
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string')) {
    errors.push('Prerequisite Concepts must be a list of names.');
    return [];
  }
  const byName = new Map<string, string>();
  for (const entry of raw) {
    const clean = entry.trim().replace(/\s+/g, ' ');
    if (!clean) {
      errors.push('Prerequisite Concept names cannot be blank.');
      continue;
    }
    byName.set(normaliseConceptName(clean), clean);
  }
  return [...byName.values()];
}

function parseFixtures(
  raw: unknown,
  itemIndex: number,
  availableMarks: number | null,
): { fixtures: ItemFixture[]; errors: string[] } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { fixtures: [], errors: ['Add at least one working-answer fixture.'] };
  }
  const fixtures: ItemFixture[] = [];
  const errors: string[] = [];
  raw.forEach((entry, fixtureIndex) => {
    if (!isRecord(entry)) {
      errors.push(`Fixture ${fixtureIndex + 1} must be a JSON object.`);
      return;
    }
    const answer = entry.studentAnswer;
    const answerValid =
      typeof answer === 'string' ||
      (Array.isArray(answer) &&
        answer.length > 0 &&
        answer.every((line) => typeof line === 'string'));
    if (!answerValid) {
      errors.push(`Fixture ${fixtureIndex + 1} needs a studentAnswer string or string array.`);
      return;
    }
    if (
      typeof entry.expectedMarks !== 'number' ||
      !Number.isSafeInteger(entry.expectedMarks) ||
      entry.expectedMarks < 0 ||
      (availableMarks !== null && entry.expectedMarks > availableMarks)
    ) {
      const message =
        availableMarks === null
          ? `Fixture ${fixtureIndex + 1} expectedMarks must be a non-negative whole number.`
          : `Fixture ${fixtureIndex + 1} expects ${String(entry.expectedMarks)} marks, but the scheme has ${availableMarks} available.`;
      errors.push(message);
      return;
    }
    if (entry.note !== undefined && typeof entry.note !== 'string') {
      errors.push(`Fixture ${fixtureIndex + 1} note must be text.`);
      return;
    }
    fixtures.push({
      id:
        typeof entry.id === 'string' && entry.id.trim()
          ? entry.id
          : `batch-${itemIndex + 1}-fixture-${fixtureIndex + 1}`,
      studentAnswer: answer as string | string[],
      expectedMarks: entry.expectedMarks,
      ...(typeof entry.note === 'string' ? { note: entry.note } : {}),
    });
  });
  return { fixtures, errors };
}

function candidateId(index: number): string {
  return `batch-item-${index + 1}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
