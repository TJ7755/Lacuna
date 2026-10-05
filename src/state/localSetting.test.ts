import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalSetting, oneOf, parseJson } from './localSetting';
import { writeAnswerStrictness } from './answerStrictness';
import { writeAudioSettings } from './audioSettings';
import { writeCourseCardDetail } from './courseCardDetail';
import { writeCourseCardMetric } from './courseCardMetric';
import { writeCourseHeaderSettings } from './courseHeaderSettings';
import { writeDashboardSort } from './dashboardSort';
import { writeAfterFinalExamPolicy } from './finalExamLifecycle';
import { writeStartInFocusMode } from './focusModePreference';
import { writeGradingMode } from './gradingMode';
import { writeInputMode } from './inputMode';
import { writeMotionSpeed } from './motionSpeed';
import { writeAutoOptimiseDefault } from './optimiseSetting';
import { readPracticeDefaults, writePracticeDefaults } from './practiceDefaults';
import { writeSidebarSettings } from './sidebarSettings';
import { useStudyMode } from './studyMode';
import { writeTypingSetting } from './typingSetting';

const colour = createLocalSetting({
  key: 'lacuna.testColour',
  event: 'lacuna:test-colour',
  parse: oneOf(['red', 'blue'], 'red'),
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('createLocalSetting', () => {
  it('reads the fallback, writes the value and announces it', () => {
    const handler = vi.fn();
    window.addEventListener(colour.event, handler);
    expect(colour.read()).toBe('red');
    colour.write('blue');
    window.removeEventListener(colour.event, handler);
    expect(localStorage.getItem('lacuna.testColour')).toBe('blue');
    expect(colour.read()).toBe('blue');
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toBe('blue');
  });

  it('updates the hook from the custom event and from other tabs', () => {
    const { result } = renderHook(() => colour.use());
    act(() => colour.write('blue'));
    expect(result.current[0]).toBe('blue');
    act(() => {
      localStorage.setItem('lacuna.testColour', 'red');
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(result.current[0]).toBe('red');
    act(() => result.current[1]('blue'));
    expect(result.current[0]).toBe('blue');
    expect(localStorage.getItem('lacuna.testColour')).toBe('blue');
  });

  it('removes both listeners on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => colour.use());
    const added = add.mock.calls.map(([type, listener]) => [type, listener]);
    expect(added.map(([type]) => type)).toEqual(['storage', 'lacuna:test-colour']);
    unmount();
    expect(remove.mock.calls.map(([type, listener]) => [type, listener])).toEqual(added);
  });

  it('falls back when stored JSON is absent or malformed', () => {
    const decode = (value: unknown) => value as number;
    expect(parseJson(null, () => 1, decode)).toBe(1);
    expect(parseJson('{', () => 1, decode)).toBe(1);
    expect(parseJson('2', () => 1, decode)).toBe(2);
  });
});

describe('device-local setting keys', () => {
  // Renaming a key silently resets every live user's preference.
  it('keeps every existing storage key', () => {
    writeAnswerStrictness('exact');
    writeAudioSettings({ autoplay: false, playbackSpeed: 1 });
    writeCourseCardDetail({ activity: false });
    writeCourseCardMetric('today');
    writeCourseHeaderSettings({});
    writeDashboardSort('name');
    writeAfterFinalExamPolicy('archive');
    writeStartInFocusMode(true);
    writeGradingMode('manual');
    writeInputMode('touch');
    writeMotionSpeed('fast');
    writeAutoOptimiseDefault(false);
    writePracticeDefaults(readPracticeDefaults());
    writeSidebarSettings({});
    const studyMode = renderHook(() => useStudyMode());
    act(() => studyMode.result.current[1]('simple'));
    writeTypingSetting('type');

    expect(Object.keys(localStorage).sort()).toEqual([
      'lacuna.afterFinalExam',
      'lacuna.answerStrictness',
      'lacuna.audioSettings',
      'lacuna.autoOptimise',
      'lacuna.courseCardDetail',
      'lacuna.courseCardMetric',
      'lacuna.courseHeaderSettings',
      'lacuna.dashboardSort',
      'lacuna.gradingMode',
      'lacuna.inputMode',
      'lacuna.motionSpeed',
      'lacuna.practiceDefaults',
      'lacuna.sidebarSettings',
      'lacuna.startInFocusMode',
      'lacuna.studyMode',
      'lacuna.typingSetting',
    ]);
  });
});
