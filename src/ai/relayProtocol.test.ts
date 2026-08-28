import { describe, expect, it } from 'vitest';
import {
  AI_RELAY_EMPTY_GENERATION,
  AI_RELAY_ENVELOPE_VERSION,
  AI_RELAY_PROTOCOL_VERSION,
  relayBrowserMailboxSchema,
  relayClaimResponseSchema,
  relayCreateSessionResponseSchema,
  relayEnvelopeSchema,
  relayPeerResponseSchema,
  relayPublicKeySchema,
  relayTerminalMailboxSchema,
  relayToolResponseSchema,
} from './relayProtocol';

const PUBLIC_KEY = base64Url(new Uint8Array(65).fill(7));

describe('AI relay protocol', () => {
  it('accepts the frozen P-256 public-key and envelope shapes', () => {
    const ciphertext = base64Url(new Uint8Array(16).fill(3));
    expect(relayPublicKeySchema.parse(PUBLIC_KEY)).toBe(PUBLIC_KEY);
    expect(
      relayEnvelopeSchema.parse({
        version: AI_RELAY_ENVELOPE_VERSION,
        nonce: base64Url(new Uint8Array(12)),
        ciphertext,
      }),
    ).toEqual({
      version: AI_RELAY_ENVELOPE_VERSION,
      nonce: base64Url(new Uint8Array(12)),
      ciphertext,
    });
    expect(AI_RELAY_EMPTY_GENERATION).toBe('"0"');
  });

  it('rejects malformed keys, nonces and extra response fields', () => {
    expect(relayPublicKeySchema.safeParse(base64Url(new Uint8Array(64))).success).toBe(false);
    expect(
      relayEnvelopeSchema.safeParse({ version: 1, nonce: 'short', ciphertext: 'AQID' }).success,
    ).toBe(false);
    expect(
      relayCreateSessionResponseSchema.safeParse({
        sessionId: 'A'.repeat(20),
        pairingCode: 'AAAA-AAAA-AAAA-AAAA-AAAA',
        browserToken: 'ab'.repeat(32),
        expiresAt: 10,
        surprise: true,
      }).success,
    ).toBe(false);
    expect(
      relayBrowserMailboxSchema.safeParse({
        version: 1,
        revision: 0,
        messages: [],
        toolResponses: [],
        terminalRevisionSeen: 0,
      }).success,
    ).toBe(false);
  });

  it('defines both sides of terminal pairing without private keys', () => {
    expect(
      relayClaimResponseSchema.parse({
        sessionId: 'A'.repeat(20),
        browserPublicKey: PUBLIC_KEY,
        terminalToken: 'ab'.repeat(32),
        expiresAt: 10,
      }),
    ).not.toHaveProperty('privateKey');
    expect(
      relayPeerResponseSchema.parse({
        terminalPublicKey: PUBLIC_KEY,
        client: { name: 'OpenCode', version: '1.2.3' },
        expiresAt: 10,
      }),
    ).toEqual({
      terminalPublicKey: PUBLIC_KEY,
      client: { name: 'OpenCode', version: '1.2.3' },
      expiresAt: 10,
    });
  });

  it('freezes cumulative browser messages and terminal events as strict v2 snapshots', () => {
    expect(
      relayBrowserMailboxSchema.parse({
        version: AI_RELAY_PROTOCOL_VERSION,
        revision: 2,
        messages: [
          {
            messageId: 'message-1',
            conversationId: 'conversation-1',
            content: 'Explain retrieval practice.',
            createdAt: 1,
            delivery: 'claimed',
            runId: 'run-1',
          },
        ],
        toolResponses: [
          {
            runId: 'run-1',
            callId: 'call-1',
            respondedAt: 5,
            ok: true,
            result: { courses: [] },
          },
        ],
        terminalRevisionSeen: 3,
      }),
    ).toMatchObject({ revision: 2, terminalRevisionSeen: 3 });

    expect(
      relayTerminalMailboxSchema.parse({
        version: AI_RELAY_PROTOCOL_VERSION,
        revision: 3,
        browserRevisionSeen: 2,
        events: [
          {
            eventId: 'event-3',
            type: 'tool_call',
            runId: 'run-1',
            callId: 'call-1',
            toolName: 'lacuna.list_courses',
            input: {},
            createdAt: 5,
          },
          {
            eventId: 'event-1',
            type: 'claimed',
            messageId: 'message-1',
            runId: 'run-1',
            claimedAt: 2,
            leaseExpiresAt: 20,
          },
          {
            eventId: 'event-2',
            type: 'stop_acknowledged',
            runId: 'run-1',
            stoppedAt: 4,
          },
        ],
      }),
    ).toMatchObject({ revision: 3 });
  });

  it('requires run identity after claim and rejects unknown mailbox fields', () => {
    expect(
      relayBrowserMailboxSchema.safeParse({
        version: AI_RELAY_PROTOCOL_VERSION,
        revision: 1,
        messages: [
          {
            messageId: 'message-1',
            conversationId: 'conversation-1',
            content: 'Hello',
            createdAt: 1,
            delivery: 'claimed',
          },
        ],
        toolResponses: [],
        terminalRevisionSeen: 0,
      }).success,
    ).toBe(false);
    expect(
      relayTerminalMailboxSchema.safeParse({
        version: AI_RELAY_PROTOCOL_VERSION,
        revision: 0,
        events: [],
        browserRevisionSeen: 0,
        ignored: true,
      }).success,
    ).toBe(false);
    expect(
      relayToolResponseSchema.safeParse({
        runId: 'run-1',
        callId: 'call-1',
        respondedAt: 1,
        ok: false,
        error: { kind: 'tool', error: { kind: 'internal', message: 'Failed.' } },
        result: {},
      }).success,
    ).toBe(false);
  });
});

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
