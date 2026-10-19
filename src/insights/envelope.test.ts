import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createInsightsOwner,
  openInsightEnvelope,
  recoverInsightsOwner,
  sealInsightEnvelope,
  type InsightsOwner,
} from './envelope';

const shareId = 'a'.repeat(32);
const context = { shareId, isoWeek: '2026-W42' };
const passphrase = 'six unrelated words kept safely offline';
const evidence = new TextEncoder().encode('pupil-17: question-4, criterion-2, 3/5 marks');
let owner: InsightsOwner;

beforeAll(async () => {
  owner = await createInsightsOwner(passphrase, shareId);
}, 30_000);

describe('insights encrypted envelopes', () => {
  it('round-trips granular bytes using only the public key on the pupil side', async () => {
    const envelope = await sealInsightEnvelope(owner.recipient, evidence, context);
    expect(await openInsightEnvelope(owner, envelope, context)).toEqual(evidence);
    expect(owner.privateKey.extractable).toBe(false);
    expect(Object.keys(envelope).sort()).toEqual(['c', 'k', 'n', 's', 'v', 'w', 'x']);
    expect(JSON.stringify(envelope)).not.toContain('pupil-17');
    expect(JSON.stringify(envelope)).not.toContain('criterion-2');
  });

  it('randomises repeat submissions', async () => {
    const first = await sealInsightEnvelope(owner.recipient, evidence, context);
    const second = await sealInsightEnvelope(owner.recipient, evidence, context);
    expect(first.n).not.toBe(second.n);
    expect(first.x).not.toBe(second.x);
    expect(first.c).not.toBe(second.c);
  });

  it.each([
    { ...context, shareId: 'b'.repeat(32) },
    { ...context, isoWeek: '2026-W41' },
  ])('rejects moving an envelope to another course or week: %j', async (other) => {
    const envelope = await sealInsightEnvelope(owner.recipient, evidence, context);
    await expect(openInsightEnvelope(owner, envelope, other)).rejects.toThrow();
    const relabelled = { ...envelope, s: other.shareId, w: other.isoWeek };
    await expect(openInsightEnvelope(owner, relabelled, other)).rejects.toThrow();
  });

  it('rejects another teacher key, even if the recipient label is changed', async () => {
    const other = await createInsightsOwner(passphrase, shareId);
    const envelope = await sealInsightEnvelope(owner.recipient, evidence, context);
    await expect(openInsightEnvelope(other, envelope, context)).rejects.toThrow();
    await expect(
      openInsightEnvelope(other, { ...envelope, k: other.recipient.keyId }, context),
    ).rejects.toThrow();
  }, 30_000);

  it.each(['n', 'x', 'c'] as const)('authenticates the %s field', async (field) => {
    const envelope = await sealInsightEnvelope(owner.recipient, evidence, context);
    const bytes = atob(envelope[field]);
    const changed = btoa(String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1));
    await expect(
      openInsightEnvelope(owner, { ...envelope, [field]: changed }, context),
    ).rejects.toThrow();
  });

  it('rejects unsupported versions and malformed transport values', async () => {
    const envelope = await sealInsightEnvelope(owner.recipient, evidence, context);
    for (const changed of [
      { ...envelope, v: 2 },
      { ...envelope, n: 'not base64' },
      { ...envelope, n: btoa('too short') },
      { ...envelope, x: '' },
      { ...envelope, c: '' },
      { ...envelope, unexpected: 'plaintext' },
      null,
    ]) {
      await expect(openInsightEnvelope(owner, changed, context)).rejects.toThrow();
    }
  });

  it('bounds payloads and rejects impossible ISO weeks before encryption', async () => {
    await expect(
      sealInsightEnvelope(owner.recipient, new Uint8Array(65_537), context),
    ).rejects.toThrow();
    await expect(
      sealInsightEnvelope(owner.recipient, evidence, { ...context, isoWeek: '2025-W53' }),
    ).rejects.toThrow();
    await expect(
      sealInsightEnvelope({ ...owner.recipient, keyId: '0'.repeat(64) }, evidence, context),
    ).rejects.toThrow();
  });

  it.each([0, 65_536])('round-trips the payload boundary at %i bytes', async (length) => {
    const plaintext = new Uint8Array(length).fill(42);
    const envelope = await sealInsightEnvelope(owner.recipient, plaintext, context);
    expect(await openInsightEnvelope(owner, envelope, context)).toEqual(plaintext);
  });
});

describe('teacher passphrase recovery', () => {
  it('recovers the same non-exportable teacher key after JSON storage', async () => {
    const envelope = await sealInsightEnvelope(owner.recipient, evidence, context);
    const backup: unknown = JSON.parse(JSON.stringify(owner.recovery));
    const recovered = await recoverInsightsOwner(backup, passphrase, shareId);
    expect(recovered.recipient).toEqual(owner.recipient);
    expect(recovered.privateKey.extractable).toBe(false);
    expect(await openInsightEnvelope(recovered, envelope, context)).toEqual(evidence);
    expect(JSON.stringify(backup)).not.toContain(passphrase);
    expect(JSON.stringify(backup)).not.toContain('PRIVATE KEY');
  }, 30_000);

  it('rejects a wrong passphrase and a backup moved to another share', async () => {
    await expect(recoverInsightsOwner(owner.recovery, 'wrong', shareId)).rejects.toThrow();
    await expect(
      recoverInsightsOwner(owner.recovery, passphrase, 'b'.repeat(32)),
    ).rejects.toThrow();
  }, 30_000);

  it('rejects recovery tampering and excessive work factors before deriving', async () => {
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    try {
      for (const backup of [
        { ...owner.recovery, v: 2 },
        { ...owner.recovery, iterations: 1 },
        { ...owner.recovery, iterations: 2_400_001 },
        { ...owner.recovery, salt: '' },
        { ...owner.recovery, c: '' },
        { ...owner.recovery, recipient: { ...owner.recipient, keyId: '0'.repeat(64) } },
      ]) {
        await expect(recoverInsightsOwner(backup, passphrase, shareId)).rejects.toThrow();
      }
      expect(derive).not.toHaveBeenCalled();
    } finally {
      derive.mockRestore();
    }
  }, 30_000);

  it.each(['salt', 'n', 'c'] as const)(
    'authenticates the recovery %s',
    async (field) => {
      const bytes = atob(owner.recovery[field]);
      const changed = btoa(String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1));
      await expect(
        recoverInsightsOwner({ ...owner.recovery, [field]: changed }, passphrase, shareId),
      ).rejects.toThrow();
    },
    30_000,
  );

  it('refuses empty passphrases', async () => {
    await expect(createInsightsOwner('', shareId)).rejects.toThrow();
    await expect(recoverInsightsOwner(owner.recovery, '', shareId)).rejects.toThrow();
  });
});
