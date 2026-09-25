import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { exchangeCredential, loadAccessConfiguration, verifySessionToken } from './access';

const credential = 'test-credential-with-at-least-thirty-two-random-characters';
const digest = createHash('sha256').update(credential).digest('hex');
const configuration = loadAccessConfiguration({
  AI_ACCESS_CREDENTIAL_HASHES: JSON.stringify({ learner_1: digest }),
  AI_SESSION_SIGNING_KEY: 'a-signing-key-with-more-than-thirty-two-characters',
})!;

describe('hosted AI access', () => {
  it('exchanges an issued credential for a scoped, expiring session', () => {
    const session = exchangeCredential(credential, configuration, 1_000_000)!;
    expect(verifySessionToken(session.token, configuration, 1_000_000)).toBe('learner_1');
    expect(verifySessionToken(session.token, configuration, session.expiresAt)).toBeNull();
    expect(verifySessionToken(`${session.token}x`, configuration, 1_000_000)).toBeNull();
    expect(exchangeCredential(`${credential}x`, configuration, 1_000_000)).toBeNull();
  });

  it('revokes sessions when their credential is removed', () => {
    const session = exchangeCredential(credential, configuration)!;
    expect(verifySessionToken(session.token, { ...configuration, credentialHashes: {} })).toBeNull();
  });

  it('fails closed on incomplete or malformed configuration', () => {
    expect(loadAccessConfiguration({ AI_ACCESS_CREDENTIAL_HASHES: '{}', AI_SESSION_SIGNING_KEY: 'x'.repeat(32) })).toBeNull();
    expect(loadAccessConfiguration({ AI_ACCESS_CREDENTIAL_HASHES: '{', AI_SESSION_SIGNING_KEY: 'x'.repeat(32) })).toBeNull();
    expect(loadAccessConfiguration({ AI_ACCESS_CREDENTIAL_HASHES: JSON.stringify({ user: digest }) })).toBeNull();
  });
});
