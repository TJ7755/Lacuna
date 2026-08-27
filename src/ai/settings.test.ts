import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAiSettings, useAiSettings, writeAiSettings } from './settings';

beforeEach(() => {
  localStorage.clear();
});

describe('AI settings', () => {
  it('keeps AI hidden by default while leaving misconception-first ready to opt into', () => {
    expect(readAiSettings()).toEqual({
      enabled: false,
      misconceptionFirstEnabled: true,
    });
  });

  it('persists device-local choices', () => {
    writeAiSettings({ enabled: true, misconceptionFirstEnabled: false });

    expect(readAiSettings()).toEqual({
      enabled: true,
      misconceptionFirstEnabled: false,
    });
  });

  it('rejects malformed stored values instead of coercing them', () => {
    localStorage.setItem(
      'lacuna.aiSettings',
      JSON.stringify({ enabled: 'yes', misconceptionFirstEnabled: 1 }),
    );

    expect(readAiSettings()).toEqual({
      enabled: false,
      misconceptionFirstEnabled: true,
    });
  });

  it('keeps a changed setting in memory when device persistence fails', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable');
    });
    const { result } = renderHook(() => useAiSettings());

    act(() => result.current[1]({ enabled: true }));

    expect(setItem).toHaveBeenCalled();
    expect(result.current[0].enabled).toBe(true);
  });
});
