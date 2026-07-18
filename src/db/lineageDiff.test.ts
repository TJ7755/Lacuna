import { describe, expect, it } from 'vitest';
import {
  diffLineage,
  type ExistingLesson,
  type LineageDiffInput,
  type LineageIdMapping,
  type ShareLessonInput,
} from './lineageDiff';

function mapping(overrides: Partial<LineageIdMapping> = {}): LineageIdMapping {
  return {
    id: 'lineage-1',
    courseId: 'course-1',
    lessonIds: [],
    noteIds: [],
    cardIds: [],
    sequenceIds: [],
    ...overrides,
  };
}

function baseLesson(overrides: Partial<ShareLessonInput> = {}): ShareLessonInput {
  return {
    i: 'lesson-1',
    n: 'Lesson One',
    notes: [],
    cards: [],
    ...overrides,
  };
}

function existingLesson(overrides: Partial<ExistingLesson> = {}): ExistingLesson {
  return {
    id: 'lesson-1',
    name: 'Lesson One',
    isExtension: false,
    orderIndex: 0,
    ...overrides,
  };
}

describe('diffLineage', () => {
  it('classifies a lesson only in incoming as a create', () => {
    const input: LineageDiffInput = {
      incoming: { lessons: [baseLesson()] },
      existing: { lessons: [], notes: [], cards: [] },
      mapping: mapping(),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result.creates.lessons).toEqual([
      {
        id: 'lesson-1',
        name: 'Lesson One',
        description: undefined,
        isExtension: false,
        releaseDate: undefined,
        examDate: undefined,
        timeZone: undefined,
        sessionFilter: undefined,
        orderIndex: 0,
      },
    ]);
    expect(result.updates.lessons).toEqual([]);
    expect(result.removals.lessonIds).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('classifies a changed field on a known lesson as an update when not student-edited', () => {
    const input: LineageDiffInput = {
      incoming: { lessons: [baseLesson({ n: 'Renamed Lesson' })] },
      existing: { lessons: [existingLesson()], notes: [], cards: [] },
      mapping: mapping({ lessonIds: ['lesson-1'] }),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result.updates.lessons).toEqual([{ id: 'lesson-1', name: 'Renamed Lesson' }]);
    expect(result.creates.lessons).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('classifies a lesson present locally but absent from incoming as a removal', () => {
    const input: LineageDiffInput = {
      incoming: { lessons: [] },
      existing: { lessons: [existingLesson()], notes: [], cards: [] },
      mapping: mapping({ lessonIds: ['lesson-1'] }),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result.removals.lessonIds).toEqual(['lesson-1']);
    expect(result.creates.lessons).toEqual([]);
    expect(result.updates.lessons).toEqual([]);
  });

  it('classifies a changed field on a student-edited lesson as a conflict, leaving local untouched', () => {
    const incomingLesson = baseLesson({ n: 'Teacher Renamed' });
    const input: LineageDiffInput = {
      incoming: { lessons: [incomingLesson] },
      existing: { lessons: [existingLesson({ name: 'Student Renamed' })], notes: [], cards: [] },
      mapping: mapping({ lessonIds: ['lesson-1'] }),
      studentEdits: new Set(['lesson-1']),
    };
    const result = diffLineage(input);
    expect(result.conflicts).toEqual([{ entityId: 'lesson-1', kind: 'lesson', incoming: incomingLesson }]);
    expect(result.updates.lessons).toEqual([]);
  });

  it('is a no-op when a student-edited entity is untouched by the incoming payload (no teacher change)', () => {
    const input: LineageDiffInput = {
      incoming: { lessons: [baseLesson()] },
      existing: { lessons: [existingLesson()], notes: [], cards: [] },
      mapping: mapping({ lessonIds: ['lesson-1'] }),
      studentEdits: new Set(['lesson-1']),
    };
    const result = diffLineage(input);
    expect(result.updates.lessons).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.creates.lessons).toEqual([]);
    expect(result.removals.lessonIds).toEqual([]);
  });

  it('classifies a pure reorder as an orderIndex-only update', () => {
    const input: LineageDiffInput = {
      incoming: {
        lessons: [baseLesson({ i: 'lesson-2', n: 'Lesson Two' }), baseLesson({ i: 'lesson-1', n: 'Lesson One' })],
      },
      existing: {
        lessons: [existingLesson({ id: 'lesson-1', orderIndex: 0 }), existingLesson({ id: 'lesson-2', name: 'Lesson Two', orderIndex: 1 })],
        notes: [],
        cards: [],
      },
      mapping: mapping({ lessonIds: ['lesson-1', 'lesson-2'] }),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result.updates.lessons).toEqual(
      expect.arrayContaining([
        { id: 'lesson-2', orderIndex: 0 },
        { id: 'lesson-1', orderIndex: 1 },
      ]),
    );
    expect(result.creates.lessons).toEqual([]);
    expect(result.removals.lessonIds).toEqual([]);
  });

  it('yields an entirely empty diff on an unchanged round-trip', () => {
    const lesson = baseLesson({
      notes: [{ i: 'note-1', n: 'Note', c: 'content' }],
      cards: [{ i: 'card-1', k: 0, f: 'front', b: 'back' }],
    });
    const input: LineageDiffInput = {
      incoming: { lessons: [lesson] },
      existing: {
        lessons: [existingLesson()],
        notes: [{ id: 'note-1', lessonId: 'lesson-1', name: 'Note', content: 'content', orderIndex: 0 }],
        cards: [{ id: 'card-1', type: 'front_back', front: 'front', back: 'back' }],
      },
      mapping: mapping({ lessonIds: ['lesson-1'], noteIds: ['note-1'], cardIds: ['card-1'] }),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result.creates).toEqual({ lessons: [], notes: [], cards: [] });
    expect(result.updates).toEqual({ lessons: [], notes: [], cards: [] });
    expect(result.removals).toEqual({ lessonIds: [], noteIds: [], cardIds: [] });
    expect(result.conflicts).toEqual([]);
  });

  it('classifies note and card creates/updates/removals nested under a lesson', () => {
    const input: LineageDiffInput = {
      incoming: {
        lessons: [
          baseLesson({
            notes: [{ i: 'note-2', n: 'New Note', c: 'new content' }],
            cards: [{ i: 'card-1', k: 0, f: 'front changed', b: 'back' }],
          }),
        ],
      },
      existing: {
        lessons: [existingLesson()],
        notes: [{ id: 'note-1', lessonId: 'lesson-1', name: 'Old Note', content: 'old content', orderIndex: 0 }],
        cards: [{ id: 'card-1', type: 'front_back', front: 'front', back: 'back' }],
      },
      mapping: mapping({ lessonIds: ['lesson-1'], noteIds: ['note-1'], cardIds: ['card-1'] }),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result.creates.notes).toEqual([{ id: 'note-2', lessonId: 'lesson-1', name: 'New Note', content: 'new content', orderIndex: 0 }]);
    expect(result.removals.noteIds).toEqual(['note-1']);
    expect(result.updates.cards).toEqual([{ id: 'card-1', front: 'front changed' }]);
  });

  it('classifies a card conflict when the student edited a card the teacher also changed', () => {
    const incomingCard = { i: 'card-1', k: 0 as const, f: 'teacher front', b: 'back' };
    const input: LineageDiffInput = {
      incoming: { lessons: [baseLesson({ cards: [incomingCard] })] },
      existing: {
        lessons: [existingLesson()],
        notes: [],
        cards: [{ id: 'card-1', type: 'front_back', front: 'student front', back: 'back' }],
      },
      mapping: mapping({ lessonIds: ['lesson-1'], cardIds: ['card-1'] }),
      studentEdits: new Set(['card-1']),
    };
    const result = diffLineage(input);
    expect(result.conflicts).toEqual([{ entityId: 'card-1', kind: 'card', incoming: incomingCard }]);
    expect(result.updates.cards).toEqual([]);
  });

  it('treats a card unknown to the mapping as a create even if a same-id local card exists (mapping is the source of truth)', () => {
    const input: LineageDiffInput = {
      incoming: { lessons: [baseLesson({ cards: [{ i: 'card-1', k: 0, f: 'front', b: 'back' }] })] },
      existing: {
        lessons: [existingLesson()],
        notes: [],
        cards: [{ id: 'card-1', type: 'front_back', front: 'front', back: 'back' }],
      },
      mapping: mapping({ lessonIds: ['lesson-1'], cardIds: [] }),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result.creates.cards).toEqual([{ id: 'card-1', lessonId: 'lesson-1', type: 'front_back', front: 'front', back: 'back', tags: undefined }]);
  });

  it('never produces sequence-shaped output — result has no sequence field', () => {
    const input: LineageDiffInput = {
      incoming: { lessons: [] },
      existing: { lessons: [], notes: [], cards: [] },
      mapping: mapping(),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result).not.toHaveProperty('sequences');
    expect(Object.keys(result)).toEqual(['creates', 'updates', 'removals', 'conflicts']);
  });

  it('maps a retired typing card kind (k=3) to front_back on create', () => {
    const input: LineageDiffInput = {
      incoming: { lessons: [baseLesson({ cards: [{ i: 'card-1', k: 3, f: 'front', b: 'back' } as any] })] },
      existing: { lessons: [existingLesson()], notes: [], cards: [] },
      mapping: mapping({ lessonIds: ['lesson-1'] }),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result.creates.cards[0].type).toBe('front_back');
  });

  it('reports empty and undefined back consistently for cloze cards', () => {
    const input: LineageDiffInput = {
      incoming: { lessons: [baseLesson({ cards: [{ i: 'card-1', k: 1, f: '{{c1::x}}' }] })] },
      existing: {
        lessons: [existingLesson()],
        notes: [],
        cards: [{ id: 'card-1', type: 'cloze', front: '{{c1::x}}', back: '' }],
      },
      mapping: mapping({ lessonIds: ['lesson-1'], cardIds: ['card-1'] }),
      studentEdits: new Set(),
    };
    const result = diffLineage(input);
    expect(result.updates.cards).toEqual([]);
  });
});
