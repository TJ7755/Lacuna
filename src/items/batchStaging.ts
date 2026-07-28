import type { ItemFixture, ItemPayload, NumericAnswerSpec } from '../db/types';
import { compileMarkScheme } from './markSchemeCompiler';
import { numericAnswerSpecIsValid } from './numericAnswerSpec';
import { runWorkingFixtures } from './fixtureRunner';
import { BATCH_OUTPUT_END, BATCH_OUTPUT_START, MAX_BATCH_ITEMS } from './prompts';

export interface BatchCandidate {
  id: string;
  index: number;
  raw: unknown;
  sourceJson: string;
  kind: 'numeric' | 'working' | null;
  question: string;
  errors: string[];
  payload?: Extract<ItemPayload, { kind: 'numeric' | 'working' }>;
  fixtureStatus: { total: number; passed: number } | null;
}

export interface BatchParseResult {
  candidates: BatchCandidate[];
  error: string | null;
}

export function parseBatchOutput(source: string): BatchParseResult {
  const start = source.indexOf(BATCH_OUTPUT_START);
  const end = source.indexOf(BATCH_OUTPUT_END, start + BATCH_OUTPUT_START.length);
  if (start === -1 || end === -1) {
    return {
      candidates: [],
      error: `Paste the complete block from ${BATCH_OUTPUT_START} to ${BATCH_OUTPUT_END}.`,
    };
  }

  const json = source.slice(start + BATCH_OUTPUT_START.length, end).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      candidates: [],
      error: `The batch JSON is invalid: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }

  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.items)) {
    return { candidates: [], error: 'The batch must contain version 1 and an items array.' };
  }
  if (parsed.items.length === 0) {
    return { candidates: [], error: 'The batch contains no items.' };
  }

  return {
    candidates: parsed.items.map((item, index) =>
      validateBatchCandidate(item, index, index >= MAX_BATCH_ITEMS),
    ),
    error: null,
  };
}

export function parseEditedCandidate(sourceJson: string, index: number): BatchCandidate {
  try {
    return validateBatchCandidate(JSON.parse(sourceJson), index, index >= MAX_BATCH_ITEMS, sourceJson);
  } catch (error) {
    return {
      id: candidateId(index),
      index,
      raw: null,
      sourceJson,
      kind: null,
      question: '',
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
  overLimit: boolean,
  sourceJson = JSON.stringify(raw, null, 2),
): BatchCandidate {
  const errors: string[] = [];
  if (overLimit) errors.push(`Batch responses are limited to ${MAX_BATCH_ITEMS} items.`);
  if (!isRecord(raw)) {
    return {
      id: candidateId(index),
      index,
      raw,
      sourceJson,
      kind: null,
      question: '',
      errors: [...errors, 'The item must be a JSON object.'],
      fixtureStatus: null,
    };
  }

  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question) errors.push('Add a non-empty question.');
  const kind = raw.kind === 'numeric' || raw.kind === 'working' ? raw.kind : null;
  if (!kind) errors.push("Item kind must be 'numeric' or 'working'.");

  let payload: BatchCandidate['payload'];
  let fixtureStatus: BatchCandidate['fixtureStatus'] = null;

  if (kind === 'numeric') {
    if (!numericAnswerSpecIsValid(raw.answer)) {
      errors.push('The numeric answer specification is invalid.');
    } else {
      payload = { v: 1, kind: 'numeric', answer: raw.answer as NumericAnswerSpec };
    }
    if (raw.fixtures !== undefined) {
      errors.push('Numeric batch items do not support fixtures yet.');
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
    const fixtureResult = parseFixtures(raw.fixtures, index, compilation.totalMarks);
    errors.push(...fixtureResult.errors);
    fixtureStatus = { total: fixtureResult.fixtures.length, passed: 0 };

    if (scheme.length > 0 && compilation.lines.every((entry) => entry.kind === 'compiled')) {
      const runs = runWorkingFixtures(scheme, fixtureResult.fixtures);
      fixtureStatus.passed = runs.filter((run) => run.passes).length;
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
    errors,
    payload,
    fixtureStatus,
  };
}

function parseFixtures(
  raw: unknown,
  itemIndex: number,
  availableMarks: number,
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
      (Array.isArray(answer) && answer.length > 0 && answer.every((line) => typeof line === 'string'));
    if (!answerValid) {
      errors.push(`Fixture ${fixtureIndex + 1} needs a studentAnswer string or string array.`);
      return;
    }
    if (
      typeof entry.expectedMarks !== 'number' ||
      !Number.isSafeInteger(entry.expectedMarks) ||
      entry.expectedMarks < 0 ||
      entry.expectedMarks > availableMarks
    ) {
      errors.push(
        `Fixture ${fixtureIndex + 1} expectedMarks must be a whole number from 0 to ${availableMarks}.`,
      );
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
