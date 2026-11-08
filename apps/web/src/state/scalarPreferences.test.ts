import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useAdvancedDetails } from './advancedDetails';
import { useAnswerInput } from './answerInput';
import { useAnswerStrictness } from './answerStrictness';
import { useCourseCardMetric } from './courseCardMetric';
import { useDashboardSort } from './dashboardSort';
import { useAfterFinalExamPolicy } from './finalExamLifecycle';
import { useStartInFocusMode } from './focusModePreference';
import { useGradingMode } from './gradingMode';
import { useInputMode } from './inputMode';
import { useMotionSpeed } from './motionSpeed';
import { useAutoOptimiseDefault } from './optimiseSetting';
import { useStudyMode } from './studyMode';

beforeEach(() => localStorage.clear());

it.each([
  [
    'lacuna.advancedDetails',
    useAdvancedDetails,
    true,
    [
      ['false', false],
      ['true', true],
    ],
  ],
  [
    'lacuna.answerInput',
    useAnswerInput,
    'course',
    [
      ['type', 'type'],
      ['reveal', 'reveal'],
    ],
  ],
  [
    'lacuna.answerStrictness',
    useAnswerStrictness,
    'lenient',
    [
      ['standard', 'standard'],
      ['exact', 'exact'],
    ],
  ],
  [
    'lacuna.courseCardMetric',
    useCourseCardMetric,
    'curriculum',
    [
      ['coverage', 'coverage'],
      ['today', 'today'],
    ],
  ],
  [
    'lacuna.dashboardSort',
    useDashboardSort,
    'recent',
    [
      ['mastery', 'mastery'],
      ['exam', 'exam'],
      ['name', 'name'],
    ],
  ],
  ['lacuna.afterFinalExam', useAfterFinalExamPolicy, 'ask', [['archive', 'archive']]],
  [
    'lacuna.startInFocusMode',
    useStartInFocusMode,
    false,
    [
      ['on', true],
      ['off', false],
    ],
  ],
  ['lacuna.gradingMode', useGradingMode, 'silent', [['manual', 'manual']]],
  [
    'lacuna.inputMode',
    useInputMode,
    'auto',
    [
      ['keyboard', 'keyboard'],
      ['touch', 'touch'],
    ],
  ],
  [
    'lacuna.motionSpeed',
    useMotionSpeed,
    'normal',
    [
      ['slow', 'slow'],
      ['fast', 'fast'],
    ],
  ],
  [
    'lacuna.autoOptimise',
    useAutoOptimiseDefault,
    true,
    [
      ['off', false],
      ['on', true],
    ],
  ],
  ['lacuna.studyMode', useStudyMode, 'fsrs', [['simple', 'simple']]],
] as const)(
  'reads saved choices and falls back safely for %s',
  (key, usePreference, fallback, choices) => {
    const initial = renderHook(() => usePreference()[0]);
    expect(initial.result.current).toBe(fallback);
    initial.unmount();
    for (const [stored, expected] of [['unsupported', fallback] as const, ...choices]) {
      localStorage.setItem(key, stored);
      const saved = renderHook(() => usePreference()[0]);
      expect(saved.result.current, stored).toBe(expected);
      saved.unmount();
    }
  },
);

it('ignores the retired typing setting', () => {
  localStorage.setItem('lacuna.typingSetting', 'type');
  expect(renderHook(() => useAnswerInput()[0]).result.current).toBe('course');
});

it.each([
  ['lacuna.startInFocusMode', useStartInFocusMode],
  ['lacuna.autoOptimise', useAutoOptimiseDefault],
] as const)('writes the established on/off encoding for %s', (key, usePreference) => {
  const { result } = renderHook(usePreference);
  act(() => result.current[1](true));
  expect(localStorage.getItem(key)).toBe('on');
  act(() => result.current[1](false));
  expect(localStorage.getItem(key)).toBe('off');
});
