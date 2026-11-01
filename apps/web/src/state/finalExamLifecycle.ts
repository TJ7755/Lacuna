import type { Course } from '../db/types';
import { createLocalSetting, oneOf } from './localSetting';

const HANDLED_KEY = 'lacuna.handledFinalExams';
export type AfterFinalExamPolicy = 'ask' | 'archive' | 'keep-revising';

const policySetting = createLocalSetting<AfterFinalExamPolicy>({
  key: 'lacuna.afterFinalExam',
  event: 'lacuna:after-final-exam',
  parse: oneOf(['archive', 'keep-revising'], 'ask'),
});

export const readAfterFinalExamPolicy = policySetting.read;
export const writeAfterFinalExamPolicy = policySetting.write;
export const useAfterFinalExamPolicy = policySetting.use;

function readHandledFinalExams(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(HANDLED_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function readHandledFinalExam(courseId: string): number | undefined {
  return readHandledFinalExams()[courseId];
}

export function markFinalExamHandled(courseId: string, examDate: number): void {
  restoreHandledFinalExam(courseId, examDate);
}

/** Restore an earlier acknowledgement after a speculative operation fails. */
export function restoreHandledFinalExam(courseId: string, examDate: number | undefined): void {
  const handled = readHandledFinalExams();
  if (examDate === undefined) delete handled[courseId];
  else handled[courseId] = examDate;
  localStorage.setItem(HANDLED_KEY, JSON.stringify(handled));
}

export function finalExamHasPassed(course: Course, now: number = Date.now()): boolean {
  return !course.archived && course.examDate !== undefined && course.examDate < now;
}

export function finalExamNeedsDecision(course: Course, now: number = Date.now()): boolean {
  return finalExamHasPassed(course, now) && readHandledFinalExam(course.id) !== course.examDate;
}
