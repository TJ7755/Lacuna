import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { readAudioSettings, useAudioSettings, writeAudioSettings } from './audioSettings';

beforeEach(() => localStorage.clear());

describe('audio settings', () => {
  it('uses the approved defaults and rejects invalid stored speeds', () => {
    expect(readAudioSettings()).toEqual({ autoplay: true, playbackSpeed: 1 });
    localStorage.setItem(
      'lacuna.audioSettings',
      JSON.stringify({ autoplay: false, playbackSpeed: 9 }),
    );
    expect(readAudioSettings()).toEqual({ autoplay: false, playbackSpeed: 1 });
  });

  it('persists changes and updates the hook', () => {
    const { result } = renderHook(() => useAudioSettings());
    act(() => result.current[1]({ autoplay: false, playbackSpeed: 1.25 }));
    expect(result.current[0]).toEqual({ autoplay: false, playbackSpeed: 1.25 });
    expect(readAudioSettings()).toEqual(result.current[0]);
  });

  it('notifies other consumers when written directly', () => {
    const { result } = renderHook(() => useAudioSettings());
    act(() => writeAudioSettings({ autoplay: true, playbackSpeed: 1.5 }));
    expect(result.current[0].playbackSpeed).toBe(1.5);
  });
});
