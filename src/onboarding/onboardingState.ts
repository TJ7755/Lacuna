import type { CourseSchedulingMode } from '../db/types';

// First-run onboarding (#816). Only a fresh install is marked pending, so existing learners
// never see it; finishing or leaving the flow clears the mark.
const ONBOARDING_KEY = 'lacuna-onboarding';

export function markOnboardingPending(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'pending');
  } catch {
    // Without storage the learner simply goes straight to Today.
  }
}

export function onboardingPending(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'pending';
  } catch {
    return false;
  }
}

export function finishOnboarding(): void {
  studyTarget = null;
  try {
    localStorage.setItem(ONBOARDING_KEY, 'done');
  } catch {
    // Best-effort, as above.
  }
}

/**
 * Where a first course should open. While onboarding is pending, the learner sees its last
 * step first and then lands in the course, whichever flow made it: onboarding itself, a
 * class code or a share link opened on a fresh install.
 */
export function onboardingDestination(path: string): string {
  return onboardingPending() ? `/start?then=${encodeURIComponent(path)}` : path;
}

export interface StudyTargetChoice {
  mode: CourseSchedulingMode;
  examDate?: number;
}

// The answer to "Do you have an exam coming up?", held for this visit so the course the
// learner makes or imports next starts with it selected.
let studyTarget: StudyTargetChoice | null = null;

export function chooseStudyTarget(choice: StudyTargetChoice): void {
  studyTarget = choice;
}

export function chosenStudyTarget(): StudyTargetChoice | null {
  return onboardingPending() ? studyTarget : null;
}
