import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { ShareLesson, SharePayloadV3 } from './share';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';

// Spike for the class-insights plan (issues #588-#594): the on-device summariser will
// key aggregate statistics by Concept and Question id, so those ids must mean the same
// entity in every copy of a distributed course. These tests pin the lineage adoption
// contract that guarantees it and document the one path that escapes it.

function lesson(overrides: Partial<ShareLesson> = {}): ShareLesson {
  return {
    i: 'lesson-1',
    n: 'Cells',
    notes: [],
    cards: [
      {
        id: 'card-1',
        k: 0 as const,
        f: 'What is a cell?',
        b: 'The basic unit of life.',
        co: 'concept-cells',
      },
    ],
    ...overrides,
  };
}

function insightPayload(overrides: Partial<SharePayloadV3> = {}): SharePayloadV3 {
  return {
    v: 3,
    by: 'Ms Teacher',
    at: 1000,
    course: { n: 'Biology', o: 0, c: 1000, e: 2_000_000, um: 'open' },
    lessons: [lesson()],
    concepts: [
      { id: 'concept-cells', n: 'Cell structure' },
      { id: 'concept-envelope', n: 'Cell envelope' },
    ],
    questions: [
      {
        id: 'question-cells',
        k: 0,
        n: 'Identify the cell',
        pl: 0,
        t: 'concept-cells',
        pr: [],
        f: 'What is a cell?',
        p: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
        e: 'A cell is the basic unit of life.',
      },
    ],
    li: 'lineage-bio',
    rv: 1,
    ...overrides,
  };
}

describe('lineage identity: Concept and Question ids are stable across copies', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('artefacts adopt the originating ids on first import of a lineage', async () => {
    const { course } = await importLineageFirstTime(insightPayload());
    expect(course.distributedCopy).toMatchObject({ lineageId: 'lineage-bio', revision: 1 });
    expect((await db.concepts.get('concept-cells'))?.courseId).toBe(course.id);
    expect((await db.concepts.get('concept-envelope'))?.courseId).toBe(course.id);
    expect((await db.questions.get('question-cells'))?.courseId).toBe(course.id);
    expect((await db.questionConcepts.get('question-cells'))?.targetConceptIds).toEqual([
      'concept-cells',
    ]);
    const mapping = await db.lineageIdMappings.get('lineage-bio');
    expect(mapping).toMatchObject({
      courseId: course.id,
      conceptIds: ['concept-cells', 'concept-envelope'],
      questionIds: ['question-cells'],
    });
  });

  it('a revision update keeps ids for existing entities and adopts new ones in place', async () => {
    const { course } = await importLineageFirstTime(insightPayload());
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': true });
    await mergeLineageUpdate(
      course.id,
      insightPayload({
        rv: 2,
        at: 2000,
        questions: [
          {
            id: 'question-cells',
            k: 0,
            n: 'Identify the cell',
            pl: 0,
            t: 'concept-cells',
            pr: [],
            f: 'What is a cell in biology?',
            p: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
            e: 'A cell is the basic unit of life.',
          },
          {
            id: 'question-cells-new',
            k: 0,
            n: 'Identify the envelope',
            pl: 0,
            t: 'concept-envelope',
            pr: [],
            f: 'What surrounds the cell?',
            p: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
            e: '',
          },
        ],
      }),
    );
    expect((await db.questions.get('question-cells'))?.courseId).toBe(course.id);
    expect((await db.questions.get('question-cells'))?.contentVersion).toBe(2);
    expect((await db.questions.get('question-cells-new'))?.courseId).toBe(course.id);
    const mapping = await db.lineageIdMappings.get('lineage-bio');
    expect(mapping).toMatchObject({
      conceptIds: ['concept-cells', 'concept-envelope'],
      questionIds: ['question-cells', 'question-cells-new'],
    });
  });

  it('a collision fallback imports as an ordinary untracked copy with remapped ids', async () => {
    // The payload ids already live in this database through the first import, so a
    // second adoption falls back to importSharePayload. Insights work must treat that
    // course as untracked: it has no distributedCopy and no lineage ids survive.
    await importLineageFirstTime(insightPayload());
    const fallback = await importLineageFirstTime(insightPayload({ li: 'lineage-bio-2' }));
    expect(fallback.course.distributedCopy).toBeUndefined();
    const fallbackConcepts = await db.concepts.where('courseId').equals(fallback.course.id).toArray();
    expect(fallbackConcepts.map((concept) => concept.id)).not.toContain('concept-cells');
    expect((await db.concepts.get('concept-cells'))?.courseId).not.toBe(fallback.course.id);
    const fallbackQuestion = await db.questions
      .where('courseId')
      .equals(fallback.course.id)
      .toArray();
    expect(fallbackQuestion.map((question) => question.id)).not.toContain('question-cells');
  });
});
