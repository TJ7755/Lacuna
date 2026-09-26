import { db } from '../db/schema';
import type { MediaAsset } from '../db/types';
import { makeId } from '../utils/id';
import type { QuestionSetRecord } from './questionSetCodec';
import { createQuestionSet, updateQuestionSet } from './questionSetRepository';
import type { QuestionSet } from './questionSets';

export const QUESTION_SET_DRAFT_PREFIX = 'questionSetDraft:';

export interface QuestionSetDraft {
  schemaVersion: 1;
  content: QuestionSet;
  baseContentRevisionId: string | null;
  draftRevisionId: string;
  updatedAt: number;
}

export class QuestionSetDraftConflictError extends Error {
  constructor() {
    super('This Question Set draft changed in another window.');
    this.name = 'QuestionSetDraftConflictError';
  }
}

export class QuestionSetDraftCorruptError extends Error {
  constructor(readonly key: string) {
    super('The saved Question Set draft cannot be read.');
    this.name = 'QuestionSetDraftCorruptError';
  }
}

export function questionSetDraftKey(courseId: string, setId: string): string {
  return `${QUESTION_SET_DRAFT_PREFIX}${encodeURIComponent(courseId)}:${encodeURIComponent(setId)}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasAnswerShape(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const answer = value as Record<string, unknown>;
  if (
    typeof answer.maxMarks !== 'number' ||
    !Array.isArray(answer.allocations) ||
    !isStringArray(answer.prerequisiteConceptIds) ||
    !answer.response ||
    typeof answer.response !== 'object'
  )
    return false;
  const response = answer.response as Record<string, unknown>;
  if (response.kind === 'multiple-choice') {
    if (
      (response.selection !== 'single' && response.selection !== 'multiple') ||
      !Array.isArray(response.options) ||
      !isStringArray(response.correctOptionIds) ||
      !response.options.every(
        (option) =>
          !!option &&
          typeof option === 'object' &&
          typeof (option as Record<string, unknown>).id === 'string' &&
          typeof (option as Record<string, unknown>).content === 'string',
      )
    )
      return false;
  } else if (response.kind !== 'written' && response.kind !== 'calculation') return false;
  return answer.allocations.every((allocation) => {
    if (!allocation || typeof allocation !== 'object') return false;
    const row = allocation as Record<string, unknown>;
    return (
      typeof row.id === 'string' &&
      typeof row.criterion === 'string' &&
      (row.explanation === undefined || typeof row.explanation === 'string') &&
      typeof row.maxMarks === 'number' &&
      (row.dimension === 'knowledge' ||
        row.dimension === 'application' ||
        row.dimension === 'exam-execution' ||
        row.dimension === 'mixed') &&
      isStringArray(row.targetConceptIds)
    );
  });
}

function hasNodeShape(value: unknown, depth: 'question' | 'part' | 'subpart'): boolean {
  if (!value || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  if (
    typeof node.id !== 'string' ||
    typeof node.prompt !== 'string' ||
    (node.answer !== undefined && !hasAnswerShape(node.answer))
  )
    return false;
  if (depth === 'subpart') return node.parts === undefined && node.subparts === undefined;
  const childKey = depth === 'question' ? 'parts' : 'subparts';
  const children = node[childKey];
  return (
    Array.isArray(children) &&
    children.every((child) => hasNodeShape(child, depth === 'question' ? 'part' : 'subpart'))
  );
}

function parseDraft(
  value: unknown,
  key: string,
  expected?: { courseId: string; setId?: string },
): QuestionSetDraft {
  if (!value || typeof value !== 'object') throw new QuestionSetDraftCorruptError(key);
  const draft = value as Partial<QuestionSetDraft>;
  const content = draft.content as Partial<QuestionSet> | undefined;
  if (
    draft.schemaVersion !== 1 ||
    !content ||
    typeof content !== 'object' ||
    typeof content.id !== 'string' ||
    !content.id.trim() ||
    typeof content.courseId !== 'string' ||
    !content.courseId.trim() ||
    typeof content.title !== 'string' ||
    !isStringArray(content.lessonIds) ||
    !isStringArray(content.assessmentIds) ||
    !Array.isArray(content.questions) ||
    !content.questions.every((question) => hasNodeShape(question, 'question')) ||
    (draft.baseContentRevisionId !== null && typeof draft.baseContentRevisionId !== 'string') ||
    typeof draft.draftRevisionId !== 'string' ||
    !draft.draftRevisionId ||
    typeof draft.updatedAt !== 'number' ||
    !Number.isFinite(draft.updatedAt) ||
    (expected &&
      (content.courseId !== expected.courseId ||
        (expected.setId !== undefined && content.id !== expected.setId)))
  ) {
    throw new QuestionSetDraftCorruptError(key);
  }
  if (key !== questionSetDraftKey(content.courseId, content.id)) {
    throw new QuestionSetDraftCorruptError(key);
  }
  return structuredClone(draft as QuestionSetDraft);
}

export function createEmptyQuestionSetDraft(
  courseId: string,
  setId: string,
  options: { makeId?: () => string; now?: number } = {},
): QuestionSetDraft {
  return {
    schemaVersion: 1,
    content: { id: setId, courseId, title: '', lessonIds: [], assessmentIds: [], questions: [] },
    baseContentRevisionId: null,
    draftRevisionId: (options.makeId ?? makeId)(),
    updatedAt: options.now ?? Date.now(),
  };
}

export function createQuestionSetDraft(
  content: QuestionSet,
  baseContentRevisionId: string,
  options: { makeId?: () => string; now?: number } = {},
): QuestionSetDraft {
  return {
    schemaVersion: 1,
    content: structuredClone({
      id: content.id,
      courseId: content.courseId,
      title: content.title,
      lessonIds: content.lessonIds,
      assessmentIds: content.assessmentIds,
      questions: content.questions,
    }),
    baseContentRevisionId,
    draftRevisionId: (options.makeId ?? makeId)(),
    updatedAt: options.now ?? Date.now(),
  };
}

export async function loadQuestionSetDraft(
  courseId: string,
  setId: string,
): Promise<QuestionSetDraft | null> {
  const key = questionSetDraftKey(courseId, setId);
  const entry = await db.appState.get(key);
  return entry ? parseDraft(entry.value, key, { courseId, setId }) : null;
}

export async function listQuestionSetDrafts(courseId: string): Promise<QuestionSetDraft[]> {
  const prefix = `${QUESTION_SET_DRAFT_PREFIX}${encodeURIComponent(courseId)}:`;
  const entries = await db.appState.where('key').startsWith(prefix).toArray();
  return entries
    .map((entry) => parseDraft(entry.value, entry.key, { courseId }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.content.id.localeCompare(b.content.id));
}

export async function saveQuestionSetDraft(
  draft: QuestionSetDraft,
  options: { expectedDraftRevisionId: string | null; makeId?: () => string; now?: number },
): Promise<QuestionSetDraft> {
  const key = questionSetDraftKey(draft.content.courseId, draft.content.id);
  return db.transaction('rw', db.appState, async () => {
    const currentEntry = await db.appState.get(key);
    const current = currentEntry
      ? parseDraft(currentEntry.value, key, {
          courseId: draft.content.courseId,
          setId: draft.content.id,
        })
      : null;
    if (
      (current && current.draftRevisionId !== options.expectedDraftRevisionId) ||
      (!current && options.expectedDraftRevisionId !== null)
    ) {
      throw new QuestionSetDraftConflictError();
    }
    const next: QuestionSetDraft = {
      ...structuredClone(draft),
      schemaVersion: 1,
      draftRevisionId: (options.makeId ?? makeId)(),
      updatedAt: Math.max(options.now ?? Date.now(), (current?.updatedAt ?? -1) + 1),
    };
    const parsed = parseDraft(next, key, {
      courseId: draft.content.courseId,
      setId: draft.content.id,
    });
    await db.appState.put({ key, value: parsed });
    return parsed;
  });
}

/** Persist a prepared asset and the draft that first references it as one local commit. */
export async function saveQuestionSetDraftWithAssets(
  draft: QuestionSetDraft,
  assets: readonly MediaAsset[],
  options: { expectedDraftRevisionId: string | null },
): Promise<QuestionSetDraft> {
  return db.transaction('rw', [db.assets, db.appState], async () => {
    if (assets.length > 0) await db.assets.bulkPut([...assets]);
    return saveQuestionSetDraft(draft, options);
  });
}

export async function deleteQuestionSetDraft(
  courseId: string,
  setId: string,
  options: { expectedDraftRevisionId?: string } = {},
): Promise<void> {
  const key = questionSetDraftKey(courseId, setId);
  await db.transaction('rw', db.appState, async () => {
    const entry = await db.appState.get(key);
    if (!entry) return;
    const current = parseDraft(entry.value, key, { courseId, setId });
    if (
      options.expectedDraftRevisionId !== undefined &&
      current.draftRevisionId !== options.expectedDraftRevisionId
    ) {
      throw new QuestionSetDraftConflictError();
    }
    await db.appState.delete(key);
  });
}

/** Validate and publish exactly the saved draft revision, removing it in the same transaction. */
export async function publishQuestionSetDraft(
  courseId: string,
  setId: string,
  expectedDraftRevisionId: string,
): Promise<QuestionSetRecord> {
  const key = questionSetDraftKey(courseId, setId);
  return db.transaction(
    'rw',
    [
      db.appState,
      db.courses,
      db.lessons,
      db.courseAssessments,
      db.concepts,
      db.questionSets,
      db.tombstones,
    ],
    async () => {
      const entry = await db.appState.get(key);
      if (!entry) throw new QuestionSetDraftConflictError();
      const draft = parseDraft(entry.value, key, { courseId, setId });
      if (draft.draftRevisionId !== expectedDraftRevisionId) {
        throw new QuestionSetDraftConflictError();
      }
      const record = draft.baseContentRevisionId
        ? await updateQuestionSet(setId, draft.content, {
            expectedContentRevisionId: draft.baseContentRevisionId,
          })
        : await createQuestionSet(draft.content);
      await db.appState.delete(key);
      return record;
    },
  );
}
