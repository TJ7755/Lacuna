import {
  validateQuestionSet,
  type AssessmentDimension,
  type MarkAllocation,
  type QuestionAnswer,
  type QuestionPart,
  type QuestionResponse,
  type QuestionSet,
  type QuestionSetQuestion,
  type QuestionSubpart,
} from './questionSets';

export interface QuestionSetRecord extends QuestionSet {
  contentVersion: number;
  contentRevisionId: string;
  createdAt: number;
  updatedAt: number;
}

type UnknownObject = Record<string, unknown>;

function object(value: unknown, path: string, keys: readonly string[]): UnknownObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  const record = value as UnknownObject;
  const unknown = Object.keys(record).find((key) => !keys.includes(key));
  if (unknown) throw new Error(`${path} has unknown field ${unknown}.`);
  return record;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string.`);
  return value;
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  return value.map((item, index) => string(item, `${path}[${index}]`));
}

function safePositiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${path} must be a positive safe integer.`);
  }
  return value;
}

function timestamp(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe-integer timestamp.`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path);
}

function parseResponse(value: unknown, path: string): QuestionResponse {
  const base = object(value, path, ['kind', 'selection', 'options', 'correctOptionIds']);
  const kind = string(base.kind, `${path}.kind`);
  if (kind === 'written' || kind === 'calculation') {
    object(value, path, ['kind']);
    return { kind };
  }
  if (kind !== 'multiple-choice') throw new Error(`${path}.kind is invalid.`);
  const selection = string(base.selection, `${path}.selection`);
  if (selection !== 'single' && selection !== 'multiple') {
    throw new Error(`${path}.selection is invalid.`);
  }
  if (!Array.isArray(base.options)) throw new Error(`${path}.options must be an array.`);
  const options = base.options.map((value, index) => {
    const optionPath = `${path}.options[${index}]`;
    const option = object(value, optionPath, ['id', 'content']);
    return {
      id: string(option.id, `${optionPath}.id`),
      content: string(option.content, `${optionPath}.content`),
    };
  });
  return {
    kind,
    selection,
    options,
    correctOptionIds: strings(base.correctOptionIds, `${path}.correctOptionIds`),
  };
}

function parseAllocation(value: unknown, path: string): MarkAllocation {
  const row = object(value, path, [
    'id',
    'criterion',
    'explanation',
    'maxMarks',
    'dimension',
    'targetConceptIds',
  ]);
  const dimension = string(row.dimension, `${path}.dimension`);
  if (!['knowledge', 'application', 'exam-execution', 'mixed'].includes(dimension)) {
    throw new Error(`${path}.dimension is invalid.`);
  }
  return {
    id: string(row.id, `${path}.id`),
    criterion: string(row.criterion, `${path}.criterion`),
    explanation: optionalString(row.explanation, `${path}.explanation`),
    maxMarks: safePositiveInteger(row.maxMarks, `${path}.maxMarks`),
    dimension: dimension as AssessmentDimension,
    targetConceptIds: strings(row.targetConceptIds, `${path}.targetConceptIds`),
  };
}

function parseAnswer(value: unknown, path: string): QuestionAnswer {
  const row = object(value, path, [
    'maxMarks',
    'response',
    'allocations',
    'prerequisiteConceptIds',
  ]);
  if (!Array.isArray(row.allocations)) throw new Error(`${path}.allocations must be an array.`);
  return {
    maxMarks: safePositiveInteger(row.maxMarks, `${path}.maxMarks`),
    response: parseResponse(row.response, `${path}.response`),
    allocations: row.allocations.map((item, index) =>
      parseAllocation(item, `${path}.allocations[${index}]`),
    ),
    prerequisiteConceptIds: strings(row.prerequisiteConceptIds, `${path}.prerequisiteConceptIds`),
  };
}

function parseSubpart(value: unknown, path: string): QuestionSubpart {
  const row = object(value, path, ['id', 'prompt', 'answer']);
  return {
    id: string(row.id, `${path}.id`),
    prompt: string(row.prompt, `${path}.prompt`),
    answer: row.answer === undefined ? undefined : parseAnswer(row.answer, `${path}.answer`),
  };
}

function parsePart(value: unknown, path: string): QuestionPart {
  const row = object(value, path, ['id', 'prompt', 'answer', 'subparts']);
  if (!Array.isArray(row.subparts)) throw new Error(`${path}.subparts must be an array.`);
  return {
    id: string(row.id, `${path}.id`),
    prompt: string(row.prompt, `${path}.prompt`),
    answer: row.answer === undefined ? undefined : parseAnswer(row.answer, `${path}.answer`),
    subparts: row.subparts.map((item, index) => parseSubpart(item, `${path}.subparts[${index}]`)),
  };
}

function parseQuestion(value: unknown, path: string): QuestionSetQuestion {
  const row = object(value, path, ['id', 'prompt', 'answer', 'parts']);
  if (!Array.isArray(row.parts)) throw new Error(`${path}.parts must be an array.`);
  return {
    id: string(row.id, `${path}.id`),
    prompt: string(row.prompt, `${path}.prompt`),
    answer: row.answer === undefined ? undefined : parseAnswer(row.answer, `${path}.answer`),
    parts: row.parts.map((item, index) => parsePart(item, `${path}.parts[${index}]`)),
  };
}

/** Parse and validate an untrusted persisted authored question-set aggregate. */
export function parseQuestionSetRecord(value: unknown): QuestionSetRecord {
  const row = object(value, 'questionSet', [
    'id',
    'courseId',
    'title',
    'lessonIds',
    'assessmentIds',
    'questions',
    'contentVersion',
    'contentRevisionId',
    'createdAt',
    'updatedAt',
  ]);
  if (!Array.isArray(row.questions)) throw new Error('questionSet.questions must be an array.');
  const record: QuestionSetRecord = {
    id: string(row.id, 'questionSet.id'),
    courseId: string(row.courseId, 'questionSet.courseId'),
    title: string(row.title, 'questionSet.title'),
    lessonIds: strings(row.lessonIds, 'questionSet.lessonIds'),
    assessmentIds: strings(row.assessmentIds, 'questionSet.assessmentIds'),
    questions: row.questions.map((item, index) =>
      parseQuestion(item, `questionSet.questions[${index}]`),
    ),
    contentVersion: safePositiveInteger(row.contentVersion, 'questionSet.contentVersion'),
    contentRevisionId: string(row.contentRevisionId, 'questionSet.contentRevisionId'),
    createdAt: timestamp(row.createdAt, 'questionSet.createdAt'),
    updatedAt: timestamp(row.updatedAt, 'questionSet.updatedAt'),
  };
  if (!record.contentRevisionId.trim()) {
    throw new Error('questionSet.contentRevisionId must not be empty.');
  }
  if (record.updatedAt < record.createdAt) {
    throw new Error('questionSet.updatedAt must not predate createdAt.');
  }
  const issues = validateQuestionSet(record);
  if (issues.length > 0) {
    throw new Error(`Invalid question set: ${issues[0].code} at ${issues[0].path}.`);
  }
  return record;
}
