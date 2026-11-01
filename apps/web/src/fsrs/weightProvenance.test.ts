import { describe, expect, it } from 'vitest';
import { defaultFsrsParameters } from './params';
import { fsrsWeightsFingerprint } from './weightProvenance';

describe('fsrsWeightsFingerprint', () => {
  it('returns the same fingerprint for identical weight arrays', () => {
    const first = defaultFsrsParameters();
    const second = defaultFsrsParameters();

    expect(fsrsWeightsFingerprint(first)).toBe(fsrsWeightsFingerprint(second));
  });

  it('changes when a weight changes', () => {
    const original = defaultFsrsParameters();
    const changed = { ...original, w: [...original.w] };
    changed.w[0] += 0.001;

    expect(fsrsWeightsFingerprint(changed)).not.toBe(fsrsWeightsFingerprint(original));
  });

  it('ignores requestRetention changes', () => {
    const original = defaultFsrsParameters();
    const changed = { ...original, requestRetention: original.requestRetention - 0.05 };

    expect(fsrsWeightsFingerprint(changed)).toBe(fsrsWeightsFingerprint(original));
  });

  it('ignores differences beyond six decimal places', () => {
    const first = defaultFsrsParameters();
    const second = { ...first, w: [...first.w] };
    first.w[0] = 1.2345671;
    second.w[0] = 1.2345674;

    expect(fsrsWeightsFingerprint(first)).toBe(fsrsWeightsFingerprint(second));
  });
});
