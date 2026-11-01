import { describe, expect, it } from 'vitest';
import { buildAudioCardFront, isAudioCardFront, parseAudioCardFront } from './audio';

const HASH = 'a'.repeat(64);

describe('audio card Markdown', () => {
  it('builds and parses a prompt plus an asset marker', () => {
    const front = buildAudioCardFront('Listen and translate:', HASH);
    expect(front).toBe(`Listen and translate:\n\n![audio](lacuna-asset://${HASH})`);
    expect(parseAudioCardFront(front)).toEqual({
      prompt: 'Listen and translate:',
      assetHash: HASH,
    });
    expect(isAudioCardFront(front)).toBe(true);
  });

  it('supports an audio-only question face', () => {
    const front = buildAudioCardFront('', HASH);
    expect(parseAudioCardFront(front)?.prompt).toBe('');
  });

  it('does not mistake ordinary images for audio', () => {
    expect(isAudioCardFront(`![diagram](lacuna-asset://${HASH})`)).toBe(false);
  });
});
