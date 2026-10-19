import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createInsightsOwner,
  openInsightEnvelope,
  recoverInsightsOwner,
  sealInsightEnvelope,
  type InsightsOwner,
} from './envelope';
import { parseInsightsRecoveryFile, serialiseInsightsRecoveryFile } from './recoveryFile';

const shareId = 'a'.repeat(32);
const passphrase = 'several unrelated words kept safely offline';
let owner: InsightsOwner;
beforeAll(async () => {
  owner = await createInsightsOwner(passphrase, shareId);
}, 30_000);

describe('teacher recovery files', () => {
  it('carries only the public course binding and encrypted recovery material to another device', async () => {
    const text = serialiseInsightsRecoveryFile(shareId, owner.recovery);
    expect(text).not.toContain(passphrase);
    expect(text).not.toContain('privateKey');
    const file = parseInsightsRecoveryFile(text);
    expect(Object.keys(file).sort()).toEqual(['kind', 'recovery', 'shareId', 'v']);
    const restored = await recoverInsightsOwner(file.recovery, passphrase, file.shareId);
    const context = { shareId, isoDay: '2026-10-18' };
    const evidence = new TextEncoder().encode('question 4: 3/5');
    const envelope = await sealInsightEnvelope(owner.recipient, evidence, context);
    expect(await openInsightEnvelope(restored, envelope, context)).toEqual(evidence);
  });

  it('rejects unrelated, oversized or plaintext-extended files before doing recovery work', () => {
    const valid = JSON.parse(serialiseInsightsRecoveryFile(shareId, owner.recovery));
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    try {
      for (const raw of [
        null,
        [],
        { ...valid, v: 2 },
        { ...valid, kind: 'backup' },
        { ...valid, shareId: 'invalid' },
        { ...valid, passphrase },
        { ...valid, recovery: { ...owner.recovery, privateKey: 'plaintext' } },
        { ...valid, recovery: { ...owner.recovery, iterations: 2_400_001 } },
      ])
        expect(() => parseInsightsRecoveryFile(JSON.stringify(raw))).toThrow('supported Gaps');
      expect(() => parseInsightsRecoveryFile('not json')).toThrow('supported Gaps');
      expect(() => parseInsightsRecoveryFile(' '.repeat(16_385))).toThrow('supported Gaps');
      expect(() => parseInsightsRecoveryFile('é'.repeat(9000))).toThrow('supported Gaps');
      expect(derive).not.toHaveBeenCalled();
    } finally {
      derive.mockRestore();
    }
  });

  it('does not let the wrapper move a key into another course', async () => {
    const raw = JSON.parse(serialiseInsightsRecoveryFile(shareId, owner.recovery));
    const changed = parseInsightsRecoveryFile(JSON.stringify({ ...raw, shareId: 'b'.repeat(32) }));
    await expect(
      recoverInsightsOwner(changed.recovery, passphrase, changed.shareId),
    ).rejects.toThrow();
  });
});
