import { beforeEach, describe, expect, it } from 'vitest';
import {
  finalExamNeedsDecision,
  markFinalExamHandled,
  readAfterFinalExamPolicy,
  readHandledFinalExam,
  writeAfterFinalExamPolicy,
} from './finalExamLifecycle';
import type { Course } from '../db/types';

const course = {
  id: 'course-1',
  examDate: 1_000,
  archived: false,
} as Course;

beforeEach(() => localStorage.clear());

describe('final-exam lifecycle decisions', () => {
  it('persists a separate device-local policy and rejects unknown stored values', () => {
    expect(readAfterFinalExamPolicy()).toBe('ask');
    writeAfterFinalExamPolicy('archive');
    expect(readAfterFinalExamPolicy()).toBe('archive');
    localStorage.setItem('lacuna.afterFinalExam', 'nonsense');
    expect(readAfterFinalExamPolicy()).toBe('ask');
  });
  it('asks only after the final exam has passed', () => {
    expect(finalExamNeedsDecision(course, 999)).toBe(false);
    expect(finalExamNeedsDecision(course, 1_001)).toBe(true);
  });

  it('does not ask again for the exact exam after Keep revising is chosen', () => {
    markFinalExamHandled(course.id, course.examDate!);
    expect(readHandledFinalExam(course.id)).toBe(course.examDate);
    expect(finalExamNeedsDecision(course, 2_000)).toBe(false);
  });

  it('asks again when a replacement final exam later passes', () => {
    markFinalExamHandled(course.id, course.examDate!);
    expect(finalExamNeedsDecision({ ...course, examDate: 3_000 }, 3_001)).toBe(true);
  });

  it('never asks for archived or steady-retention courses', () => {
    expect(finalExamNeedsDecision({ ...course, archived: true }, 2_000)).toBe(false);
    expect(finalExamNeedsDecision({ ...course, examDate: undefined }, 2_000)).toBe(false);
  });
});
