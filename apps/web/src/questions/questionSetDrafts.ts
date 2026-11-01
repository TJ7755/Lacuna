import { db } from '../db/schema';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import { createQuestionSet, updateQuestionSet } from './questionSetRepository';
import {
  parseDraft,
  questionSetDraftKey,
  QuestionSetDraftConflictError,
} from './questionSetDraftMaintenance';

export {
  QUESTION_SET_DRAFT_PREFIX,
  QuestionSetDraftConflictError,
  QuestionSetDraftCorruptError,
  questionSetDraftKey,
  createEmptyQuestionSetDraft,
  createQuestionSetDraft,
  loadQuestionSetDraft,
  listQuestionSetDrafts,
  saveQuestionSetDraft,
  saveQuestionSetDraftWithAssets,
  deleteQuestionSetDraft,
  type QuestionSetDraft,
} from './questionSetDraftMaintenance';

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
