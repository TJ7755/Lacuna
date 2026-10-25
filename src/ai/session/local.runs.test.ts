import { describe, expect, it, vi } from 'vitest';
import { LACUNA_AI_PROTOCOL_VERSION } from '../protocol';
import { createLocalAiSession } from './local';
import { requestSource } from './local.testHarness';

describe('local AI session', () => {
  it('renews an active run lease without changing its identity', async () => {
    const transport = requestSource();
    let clock = 1_000;
    const scheduled: Array<{
      task: () => void;
      delayMs: number;
      cancel: ReturnType<typeof vi.fn>;
    }> = [];
    const session = createLocalAiSession({
      source: transport.source,
      now: () => clock,
      timers: {
        schedule(task, delayMs) {
          const cancel = vi.fn();
          scheduled.push({ task, delayMs, cancel });
          return cancel;
        },
      },
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    await session.send('Take the time needed.');
    await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });

    clock = 61_000;
    await expect(
      transport.request('channel-1', {
        type: 'renew_lease',
        connectionId: 'connection-1',
        runId: 'run-1',
        leaseMs: 300_000,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        type: 'lease_renewed',
        runId: 'run-1',
        leaseExpiresAt: 361_000,
      },
    });
    expect(scheduled[0].cancel).toHaveBeenCalledOnce();
    expect(scheduled[1].delayMs).toBe(300_000);
    expect(session.getSnapshot().run).toMatchObject({
      status: 'active',
      runId: 'run-1',
      leaseExpiresAt: 361_000,
    });
  });

  it('records an identical retried reply once and rejects changed content', async () => {
    const transport = requestSource();
    const session = createLocalAiSession({
      source: transport.source,
      now: () => 1_000,
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    await session.send('Reply once.');
    await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });
    const reply = {
      type: 'reply' as const,
      connectionId: 'connection-1',
      runId: 'run-1',
      messageId: 'message-1',
      reply: { content: 'Delivered exactly once.' },
    };

    await expect(transport.request('channel-1', reply)).resolves.toEqual({
      ok: true,
      data: { type: 'reply_recorded', messageId: 'message-1' },
    });
    await expect(transport.request('channel-1', reply)).resolves.toEqual({
      ok: true,
      data: { type: 'reply_recorded', messageId: 'message-1' },
    });
    await expect(
      transport.request('channel-1', {
        ...reply,
        reply: { content: 'A conflicting second answer.' },
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'conflict' } });
    expect(session.getSnapshot().items.filter((item) => item.kind === 'assistant')).toHaveLength(1);
  });

  it('expires an unacknowledged Stop at the claim lease without requeueing the stopped prompt', async () => {
    const transport = requestSource();
    let clock = 5_000;
    let expireLease: () => void = () => undefined;
    const session = createLocalAiSession({
      source: transport.source,
      now: () => clock,
      timers: {
        schedule(task) {
          expireLease = task;
          return vi.fn();
        },
      },
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    await session.send('Stop this prompt.');
    await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });
    await session.send('Keep this follow-up as a draft.');
    await session.stop('run-1');

    clock = 305_000;
    expireLease();

    expect(session.getSnapshot()).toMatchObject({
      run: { status: 'expired', runId: 'run-1', expiredAt: 305_000 },
      draft: 'Keep this follow-up as a draft.',
      queuedFollowUp: null,
      items: [{ kind: 'user', content: 'Stop this prompt.', delivery: 'stopped' }],
      activity: { status: 'failed', summary: 'Stop acknowledgement expired' },
    });
    await expect(session.send('Start a new prompt.')).resolves.toMatchObject({ ok: true });
    await expect(
      transport.request('channel-1', {
        type: 'list_pending',
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { messages: [{ content: 'Start a new prompt.' }] },
    });
  });

  it('expires a bounded claim lease and requeues the message', async () => {
    const transport = requestSource();
    let clock = 5_000;
    let expireLease: () => void = () => undefined;
    const session = createLocalAiSession({
      source: transport.source,
      now: () => clock,
      timers: {
        schedule(task) {
          expireLease = task;
          return vi.fn();
        },
      },
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    await transport.request('channel-1', {
      type: 'connect',
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    });
    await session.send('Do not lose this prompt.');
    await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });

    clock = 305_000;
    expireLease();

    expect(session.getSnapshot()).toMatchObject({
      run: { status: 'expired', runId: 'run-1', expiredAt: 305_000 },
      items: [
        { kind: 'user', delivery: 'queued' },
        { kind: 'error', error: { kind: 'internal' } },
      ],
    });
    await expect(
      transport.request('channel-1', {
        type: 'list_pending',
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { messages: [{ content: 'Do not lose this prompt.' }] },
    });
  });
});
