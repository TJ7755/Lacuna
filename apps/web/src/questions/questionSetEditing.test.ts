import { describe, expect, it } from 'vitest';
import type { QuestionSet } from './questionSets';
import {
  addPart,
  addQuestion,
  addSubpart,
  movePart,
  moveQuestion,
  moveSubpart,
  removePart,
  removeQuestion,
  removeSubpart,
} from './questionSetEditing';

const empty = (): QuestionSet => ({
  id: 'set',
  courseId: 'course',
  title: '',
  lessonIds: [],
  assessmentIds: [],
  questions: [],
});

describe('Question Set editing', () => {
  it('adds incomplete nodes with stable identities and ordered movement', () => {
    let set = addQuestion(empty(), { id: 'q1' });
    set = addQuestion(set, { id: 'q2' });
    set = addPart(set, 'q1', { id: 'p1' });
    set = addPart(set, 'q1', { id: 'p2' });
    set = addSubpart(set, 'q1', 'p1', { id: 's1' });
    set = addSubpart(set, 'q1', 'p1', { id: 's2' });

    set = moveQuestion(set, 'q2', 0);
    set = movePart(set, 'q1', 'p2', 0);
    set = moveSubpart(set, 'q1', 'p1', 's2', 0);

    expect(set.questions.map(({ id }) => id)).toEqual(['q2', 'q1']);
    expect(set.questions[1].parts.map(({ id }) => id)).toEqual(['p2', 'p1']);
    expect(set.questions[1].parts[1].subparts.map(({ id }) => id)).toEqual(['s2', 's1']);
    expect(set.questions[1].parts[1].subparts[0]).toEqual({ id: 's2', prompt: '' });
  });

  it('removes only the requested branch without mutating the input', () => {
    let original = addQuestion(empty(), { id: 'q1' });
    original = addQuestion(original, { id: 'q2' });
    original = addPart(original, 'q1', { id: 'p1' });
    original = addPart(original, 'q1', { id: 'p2' });
    original = addSubpart(original, 'q1', 'p1', { id: 's1' });
    original = addSubpart(original, 'q1', 'p1', { id: 's2' });

    const withoutSubpart = removeSubpart(original, 'q1', 'p1', 's1');
    const withoutPart = removePart(withoutSubpart, 'q1', 'p2');
    const withoutQuestion = removeQuestion(withoutPart, 'q2');

    expect(original.questions).toHaveLength(2);
    expect(withoutQuestion.questions[0].parts).toHaveLength(1);
    expect(withoutQuestion.questions[0].parts[0].subparts.map(({ id }) => id)).toEqual(['s2']);
  });

  it('rejects missing identities and impossible target indexes', () => {
    const set = addQuestion(empty(), { id: 'q1' });
    expect(() => removeQuestion(set, 'missing')).toThrow('not found');
    expect(() => moveQuestion(set, 'q1', 1)).toThrow('Invalid target index');
    expect(() => addPart(set, 'missing', { id: 'p1' })).toThrow('not found');
  });
});
