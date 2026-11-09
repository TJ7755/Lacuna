import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useCourseHeaderSettings } from './courseHeaderSettings';

const key = 'lacuna.courseHeaderSettings';
beforeEach(() => localStorage.clear());

it.each([null, 'not-json'])('shows the default pills for %j', (stored) => {
  if (stored !== null) localStorage.setItem(key, stored);
  const { result } = renderHook(useCourseHeaderSettings);
  expect(result.current[0].statPills.filter((pill) => pill.visible).map((pill) => pill.id)).toEqual(
    ['due', 'mastery'],
  );
});

it('keeps saved pill choices in order while adopting the current pills and labels', () => {
  localStorage.setItem(
    key,
    JSON.stringify({
      statPills: [
        { id: 'mastery', label: 'Mastery', visible: false },
        { id: 'retired', label: 'Retired', visible: true },
        { id: 'due', label: 'Cards due now', visible: true },
      ],
    }),
  );
  const { result } = renderHook(useCourseHeaderSettings);
  const { statPills } = result.current[0];
  expect(statPills.map((pill) => pill.id)).toEqual([
    'mastery',
    'due',
    'exam',
    'unmapped',
    'lessons',
  ]);
  expect(statPills[0]).toEqual({ id: 'mastery', label: 'Exam readiness', visible: false });
  expect(statPills[2].visible).toBe(false);
  act(() =>
    result.current[1]({
      statPills: statPills.map((pill) => (pill.id === 'due' ? { ...pill, visible: false } : pill)),
    }),
  );
  expect(JSON.parse(localStorage.getItem(key)!).statPills[1].visible).toBe(false);
});
