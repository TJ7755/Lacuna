import { describe, expect, it } from 'vitest';
import { lessonMetaParts } from './lessonMeta';

describe('lessonMetaParts', () => {
  it('states learnt cards and notes, omitting empty parts', () => {
    expect(lessonMetaParts({ learnt: 13, total: 18, noteCount: 2, dueCount: 0 })).toEqual([
      '13 of 18 cards learnt',
      '2 notes',
    ]);
  });

  it('adds due cards and the exam countdown when present', () => {
    expect(
      lessonMetaParts({ learnt: 1, total: 1, noteCount: 1, dueCount: 3, daysToExam: 1 }),
    ).toEqual(['1 of 1 card learnt', '1 note', '3 due', 'Exam in 1 day']);
    expect(lessonMetaParts({ learnt: 0, total: 0, noteCount: 0, dueCount: 0, daysToExam: 0 }).pop()).toBe(
      'Exam today',
    );
  });
});
