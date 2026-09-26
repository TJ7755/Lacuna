import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse, deleteCourse, restoreCourse, snapshotCourse } from '../db/repository';
import {
  createEmptyQuestionSetDraft,
  createQuestionSetDraft,
  deleteQuestionSetDraft,
  listQuestionSetDrafts,
  loadQuestionSetDraft,
  QuestionSetDraftConflictError,
  QuestionSetDraftCorruptError,
  questionSetDraftKey,
  publishQuestionSetDraft,
  saveQuestionSetDraft,
} from './questionSetDrafts';
import { createQuestionSet, updateQuestionSet } from './questionSetRepository';

describe('Question Set drafts', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([db.appState.clear(), db.questionSets.clear(), db.courses.clear()]);
  });

  it('round-trips an incomplete title-first draft and lists it by Course', async () => {
    const initial = createEmptyQuestionSetDraft('course-1', 'set-1', {
      makeId: () => 'initial',
      now: 1,
    });
    initial.content.title = 'Half written';
    const saved = await saveQuestionSetDraft(initial, {
      expectedDraftRevisionId: null,
      makeId: () => 'saved',
      now: 2,
    });

    expect(await loadQuestionSetDraft('course-1', 'set-1')).toEqual(saved);
    expect(await listQuestionSetDrafts('course-1')).toEqual([saved]);
    expect(await listQuestionSetDrafts('course-2')).toEqual([]);
  });

  it('rejects stale writes and guarded deletion without losing the newer draft', async () => {
    const initial = createEmptyQuestionSetDraft('course', 'set', { makeId: () => 'initial' });
    const first = await saveQuestionSetDraft(initial, {
      expectedDraftRevisionId: null,
      makeId: () => 'first',
    });
    const newer = await saveQuestionSetDraft(
      { ...first, content: { ...first.content, title: 'Newer' } },
      { expectedDraftRevisionId: 'first', makeId: () => 'newer' },
    );

    await expect(
      saveQuestionSetDraft(first, { expectedDraftRevisionId: 'first' }),
    ).rejects.toBeInstanceOf(QuestionSetDraftConflictError);
    await expect(
      deleteQuestionSetDraft('course', 'set', { expectedDraftRevisionId: 'first' }),
    ).rejects.toBeInstanceOf(QuestionSetDraftConflictError);
    expect(await loadQuestionSetDraft('course', 'set')).toEqual(newer);
  });

  it('leaves malformed stored work untouched and refuses to overwrite it', async () => {
    const key = questionSetDraftKey('course', 'set');
    await db.appState.put({ key, value: { schemaVersion: 1, content: 'broken' } });
    await expect(loadQuestionSetDraft('course', 'set')).rejects.toBeInstanceOf(
      QuestionSetDraftCorruptError,
    );
    const replacement = createEmptyQuestionSetDraft('course', 'set');
    await expect(
      saveQuestionSetDraft(replacement, { expectedDraftRevisionId: null }),
    ).rejects.toBeInstanceOf(QuestionSetDraftCorruptError);
    expect((await db.appState.get(key))?.value).toEqual({ schemaVersion: 1, content: 'broken' });
  });

  it('rejects malformed nested content and mismatched key identities', async () => {
    const malformed = createEmptyQuestionSetDraft('course', 'other-set');
    const key = questionSetDraftKey('course', 'set');
    await db.appState.put({ key, value: malformed });

    await expect(loadQuestionSetDraft('course', 'set')).rejects.toBeInstanceOf(
      QuestionSetDraftCorruptError,
    );
    expect(await db.appState.get(key)).toBeDefined();
  });

  it('rejects malformed nested content and allocation dimensions', async () => {
    const malformed = createEmptyQuestionSetDraft('course', 'set');
    malformed.content.questions = [
      {
        id: 'q1',
        prompt: '',
        parts: [],
        answer: {
          maxMarks: 0,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'a1',
              criterion: '',
              maxMarks: 0,
              dimension: 'invented' as never,
              targetConceptIds: [],
            },
          ],
        },
      },
    ];
    const key = questionSetDraftKey('course', 'set');
    await db.appState.put({ key, value: malformed });

    await expect(loadQuestionSetDraft('course', 'set')).rejects.toBeInstanceOf(
      QuestionSetDraftCorruptError,
    );
  });

  it('removes a saved revision and tolerates an already absent draft', async () => {
    const initial = createEmptyQuestionSetDraft('course', 'set');
    const saved = await saveQuestionSetDraft(initial, {
      expectedDraftRevisionId: null,
      makeId: () => 'saved',
    });
    await deleteQuestionSetDraft('course', 'set', {
      expectedDraftRevisionId: saved.draftRevisionId,
    });
    await deleteQuestionSetDraft('course', 'set', {
      expectedDraftRevisionId: saved.draftRevisionId,
    });
    expect(await loadQuestionSetDraft('course', 'set')).toBeNull();
  });

  it('publishes a complete saved draft and removes that exact revision atomically', async () => {
    const course = await createCourse('Biology');
    const initial = createEmptyQuestionSetDraft(course.id, 'set');
    initial.content.title = 'Cells';
    initial.content.questions = [
      {
        id: 'q1',
        prompt: 'Name the organelle.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'a1',
              criterion: 'Nucleus',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: [],
            },
          ],
        },
      },
    ];
    const saved = await saveQuestionSetDraft(initial, {
      expectedDraftRevisionId: null,
      makeId: () => 'draft-revision',
    });

    const published = await publishQuestionSetDraft(course.id, 'set', saved.draftRevisionId);

    expect(published.title).toBe('Cells');
    expect(await db.appState.get(questionSetDraftKey(course.id, 'set'))).toBeUndefined();
  });

  it('retains an invalid draft without changing existing published content', async () => {
    const course = await createCourse('Biology');
    const published = await createQuestionSet({
      id: 'set',
      courseId: course.id,
      title: 'Published',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'q1',
          prompt: 'Name the organelle.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'a1',
                criterion: 'Nucleus',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    });
    const invalid = createQuestionSetDraft(
      {
        id: published.id,
        courseId: published.courseId,
        title: '',
        lessonIds: published.lessonIds,
        assessmentIds: published.assessmentIds,
        questions: published.questions,
      },
      published.contentRevisionId,
    );
    const saved = await saveQuestionSetDraft(invalid, {
      expectedDraftRevisionId: null,
      makeId: () => 'invalid-draft',
    });

    await expect(publishQuestionSetDraft(course.id, 'set', saved.draftRevisionId)).rejects.toThrow(
      'missing-title',
    );
    expect((await db.questionSets.get('set'))?.title).toBe('Published');
    expect(await loadQuestionSetDraft(course.id, 'set')).toEqual(saved);
  });

  it('retains a draft when its published base revision is stale', async () => {
    const course = await createCourse('Biology');
    const content = {
      id: 'set',
      courseId: course.id,
      title: 'Published',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'q1',
          prompt: 'Name the organelle.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' as const },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'a1',
                criterion: 'Nucleus',
                maxMarks: 1,
                dimension: 'knowledge' as const,
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    };
    const published = await createQuestionSet(content);
    const saved = await saveQuestionSetDraft(
      createQuestionSetDraft({ ...content, title: 'Stale draft' }, published.contentRevisionId),
      { expectedDraftRevisionId: null, makeId: () => 'stale-draft' },
    );
    await updateQuestionSet(
      'set',
      { ...content, title: 'Newer published content' },
      {
        expectedContentRevisionId: published.contentRevisionId,
      },
    );

    await expect(publishQuestionSetDraft(course.id, 'set', saved.draftRevisionId)).rejects.toThrow(
      'changed since it was opened',
    );
    expect((await db.questionSets.get('set'))?.title).toBe('Newer published content');
    expect(await loadQuestionSetDraft(course.id, 'set')).toEqual(saved);
  });

  it('rolls back a publish when removing the draft fails', async () => {
    const course = await createCourse('Biology');
    const initial = createEmptyQuestionSetDraft(course.id, 'set');
    initial.content.title = 'Cells';
    initial.content.questions = [
      {
        id: 'q1',
        prompt: 'Name the organelle.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'a1',
              criterion: 'Nucleus',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: [],
            },
          ],
        },
      },
    ];
    const saved = await saveQuestionSetDraft(initial, {
      expectedDraftRevisionId: null,
      makeId: () => 'draft-revision',
    });
    const remove = vi.spyOn(db.appState, 'delete').mockRejectedValueOnce(new Error('Disk failed'));

    await expect(
      publishQuestionSetDraft(course.id, 'set', saved.draftRevisionId),
    ).rejects.toThrow();
    expect(await db.questionSets.get('set')).toBeUndefined();
    expect(await loadQuestionSetDraft(course.id, 'set')).toEqual(saved);
    remove.mockRestore();
  });

  it('removes local drafts with a Course and restores them on undo', async () => {
    const course = await createCourse('Biology');
    const saved = await saveQuestionSetDraft(createEmptyQuestionSetDraft(course.id, 'set'), {
      expectedDraftRevisionId: null,
      makeId: () => 'saved',
    });
    const snapshot = await snapshotCourse(course.id);
    expect(snapshot).not.toBeNull();

    await deleteCourse(course.id);
    expect(await loadQuestionSetDraft(course.id, 'set')).toBeNull();

    await restoreCourse(snapshot!);
    const restored = await loadQuestionSetDraft(course.id, 'set');
    expect(restored).toMatchObject({ content: saved.content });
    expect(restored?.draftRevisionId).not.toBe(saved.draftRevisionId);
    expect(restored!.updatedAt).toBeGreaterThan(saved.updatedAt);
    await expect(
      saveQuestionSetDraft(saved, { expectedDraftRevisionId: saved.draftRevisionId }),
    ).rejects.toBeInstanceOf(QuestionSetDraftConflictError);
  });
});
