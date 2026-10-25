import { beforeEach, describe, expect, it } from 'vitest';
import {
  chooseStudyTarget,
  chosenStudyTarget,
  finishOnboarding,
  markOnboardingPending,
  onboardingDestination,
  onboardingPending,
} from './onboardingState';

describe('onboarding state', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('leaves existing learners out of onboarding', () => {
    expect(onboardingPending()).toBe(false);
    expect(onboardingDestination('/course/a')).toBe('/course/a');
  });

  it('routes a new learner’s first course through the last step', () => {
    markOnboardingPending();
    expect(onboardingDestination('/course/a b')).toBe('/start?then=%2Fcourse%2Fa%20b');
  });

  it('offers the study target only while onboarding is pending', () => {
    markOnboardingPending();
    chooseStudyTarget({ mode: 'exam', examDate: 1_000 });
    expect(chosenStudyTarget()).toEqual({ mode: 'exam', examDate: 1_000 });

    finishOnboarding();
    expect(onboardingPending()).toBe(false);
    expect(chosenStudyTarget()).toBeNull();
    expect(onboardingDestination('/course/a')).toBe('/course/a');
  });

  it('keeps the study target across a reload and ignores a damaged one', () => {
    markOnboardingPending();
    chooseStudyTarget({ mode: 'steady' });
    expect(JSON.parse(sessionStorage.getItem('lacuna-onboarding-target')!)).toEqual({
      mode: 'steady',
    });
    expect(chosenStudyTarget()).toEqual({ mode: 'steady' });
    sessionStorage.setItem('lacuna-onboarding-target', '{"mode":"exam","examDate":"soon"}');
    expect(chosenStudyTarget()).toBeNull();
  });
});
