import { useEffect, useState } from 'react';
import type { Course } from '../db/types';

const HANDLED_KEY = 'lacuna.handledFinalExams';
const POLICY_KEY = 'lacuna.afterFinalExam';
const POLICY_EVENT = 'lacuna:after-final-exam';

export type AfterFinalExamPolicy = 'ask' | 'archive' | 'keep-revising';

export function readAfterFinalExamPolicy(): AfterFinalExamPolicy {
  const stored = localStorage.getItem(POLICY_KEY);
  return stored === 'archive' || stored === 'keep-revising' ? stored : 'ask';
}

export function writeAfterFinalExamPolicy(policy: AfterFinalExamPolicy): void {
  localStorage.setItem(POLICY_KEY, policy);
  window.dispatchEvent(new CustomEvent(POLICY_EVENT));
}

export function useAfterFinalExamPolicy(): [
  AfterFinalExamPolicy,
  (policy: AfterFinalExamPolicy) => void,
] {
  const [policy, setPolicy] = useState(readAfterFinalExamPolicy);
  useEffect(() => {
    const refresh = () => setPolicy(readAfterFinalExamPolicy());
    window.addEventListener('storage', refresh);
    window.addEventListener(POLICY_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(POLICY_EVENT, refresh);
    };
  }, []);
  return [policy, writeAfterFinalExamPolicy];
}

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
