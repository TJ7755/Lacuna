import { beforeEach, describe, expect, it } from 'vitest';
import { readAiSettings, writeAiSettings } from './settings';

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
});
