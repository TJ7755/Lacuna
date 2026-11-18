import { describe, expect, it } from 'vitest';
import { SEQUENCE_PRESETS, getPreset, presetForSequence } from './sequencePresets';

describe('SEQUENCE_PRESETS', () => {
  it('has a unique id for every preset', () => {
    const ids = SEQUENCE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only the script preset requires speakers', () => {
    const withSpeakers = SEQUENCE_PRESETS.filter((p) => p.usesSpeakers).map((p) => p.id);
    expect(withSpeakers).toEqual(['script']);
  });

  it('uses speakerless line defaults and the appropriate chunk terminology', () => {
    for (const id of ['poetry', 'speech'] as const) {
      expect(getPreset(id)).toMatchObject({
        mode: 'lines',
        usesSpeakers: false,
        defaultCueWindow: 2,
      });
    }
    expect(getPreset('poetry').terminology.chunkLabel).toBe('Verse');
    expect(getPreset('speech').terminology.chunkLabel).toBe('Section');
  });
});

describe('getPreset', () => {
  it('resolves a known id', () => {
    expect(getPreset('procedure').terminology.item).toBe('step');
  });

  it('falls back to list for an unknown/undefined id', () => {
    expect(getPreset(undefined).id).toBe('list');
    // @ts-expect-error exercising the runtime fallback for a stale/removed id
    expect(getPreset('retired-preset').id).toBe('list');
  });
});

describe('presetForSequence', () => {
  it('prefers the stored presetId', () => {
    expect(presetForSequence({ presetId: 'timeline', mode: 'list' }).id).toBe('timeline');
  });

  it('infers list mode as the list preset', () => {
    expect(presetForSequence({ mode: undefined }).id).toBe('list');
    expect(presetForSequence({ mode: 'list' }).id).toBe('list');
  });

  it('infers lines mode with a mySpeaker as script', () => {
    expect(presetForSequence({ mode: 'lines', mySpeaker: 'ALICE' }).id).toBe('script');
  });

  it('infers speakerless lines mode as poetry', () => {
    expect(presetForSequence({ mode: 'lines' }).id).toBe('poetry');
  });
});
