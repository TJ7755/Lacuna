import { describe, expect, it, vi } from 'vitest';
import { LACUNA_AI_PROTOCOL_VERSION } from '../protocol';
import { createLocalAiSession } from './local';
import { requestSource } from './local.testHarness';

describe('local AI session', () => {
  it('resolves a pending wait and terminates its channel when the user disconnects it', async () => {
    const transport = requestSource();
    const session = createLocalAiSession({
      source: transport.source,
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    const pendingWait = transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 25_000,
      leaseMs: 300_000,
    });

    await session.resetConnection();

    await expect(pendingWait).resolves.toMatchObject({
      ok: false,
      error: { kind: 'unavailable', reason: 'disconnected' },
    });
    expect(transport.terminate).toHaveBeenCalledWith('channel-1');
  });

  it('cancels a bounded wait and clears authority when the owning channel disappears', async () => {
    const transport = requestSource();
    const cancelTimeout = vi.fn();
    const session = createLocalAiSession({
      source: transport.source,
      timers: { schedule: vi.fn(() => cancelTimeout) },
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    const waiting = transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 25_000,
      leaseMs: 300_000,
    });

    transport.disconnect('other-channel');
    expect(session.getSnapshot().connection.status).toBe('connected');
    transport.disconnect('channel-1');

    await expect(waiting).resolves.toMatchObject({
      ok: false,
      error: { kind: 'unavailable', reason: 'disconnected' },
    });
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'Terminal disconnected',
    });
    await expect(
      transport.request('channel-1', {
        type: 'heartbeat',
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'unavailable' } });
  });

  it('restores an unclaimed prompt as a draft when the owning channel disappears', async () => {
    const transport = requestSource();
    const session = createLocalAiSession({
      source: transport.source,
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    await session.send('Keep this prompt available to resend.');

    transport.disconnect('channel-1');

    expect(session.getSnapshot()).toMatchObject({
      connection: { status: 'disconnected', reason: 'Terminal disconnected' },
      draft: 'Keep this prompt available to resend.',
      items: [
        {
          kind: 'user',
          content: 'Keep this prompt available to resend.',
          delivery: 'stopped',
        },
      ],
    });
  });

  it('delivers a message into an existing 25-second wait without polling', async () => {
    const transport = requestSource();
    const cancelWait = vi.fn();
    const schedule = vi.fn(() => cancelWait);
    const session = createLocalAiSession({
      source: transport.source,
      timers: { schedule },
      now: () => 3_000,
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    const waiting = transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 25_000,
      leaseMs: 300_000,
    });

    await session.send('Arrived during the wait.');

    await expect(waiting).resolves.toMatchObject({
      ok: true,
      data: { type: 'message_claim', message: { content: 'Arrived during the wait.' } },
    });
    expect(schedule).toHaveBeenNthCalledWith(1, expect.any(Function), 25_000);
    expect(schedule).toHaveBeenNthCalledWith(2, expect.any(Function), 300_000);
    expect(cancelWait).toHaveBeenCalledOnce();
  });
});
