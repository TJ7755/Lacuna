import { describe, expect, it, vi } from 'vitest';
import { LACUNA_AI_PROTOCOL_VERSION } from '../protocol';
import { createLocalAiSession } from './local';
import { requestSource } from './local.testHarness';

describe('local AI session', () => {
  it('does not manufacture a pairing code for the direct local transport', async () => {
    const transport = requestSource();
    const session = createLocalAiSession({ source: transport.source });

    await expect(session.pair()).resolves.toEqual({
      ok: false,
      error: {
        kind: 'unavailable',
        message: 'The desktop AI companion connects directly; no pairing code is required.',
      },
    });
  });

  it('clears the disabled reason when the same runtime is activated again', () => {
    const transport = requestSource();
    const session = createLocalAiSession({ source: transport.source });

    session.activate();
    session.dispose();
    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'AI was disabled.',
    });

    session.activate();

    expect(session.getSnapshot().connection).toEqual({ status: 'disconnected' });
    expect(transport.listening()).toBe(true);
  });

  it('terminates an idle companion channel when the user disconnects it', async () => {
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

    await expect(session.resetConnection()).resolves.toEqual({ ok: true, data: undefined });

    expect(session.getSnapshot().connection).toEqual({ status: 'disconnected' });
    expect(transport.terminate).toHaveBeenCalledOnce();
    expect(transport.terminate).toHaveBeenCalledWith('channel-1');
  });

  it('connects one purpose-bound companion and completes a message through the AiSession seam', async () => {
    const transport = requestSource();
    const session = createLocalAiSession({
      source: transport.source,
      now: vi.fn(() => 1_000),
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();

    await expect(
      transport.request('channel-1', {
        type: 'connect',
        protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
        client: { name: 'Codex', version: '1.0' },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { type: 'connection', connectionId: 'connection-1', client: { name: 'Codex' } },
    });
    await expect(session.send('Explain retrieval practice.')).resolves.toEqual({
      ok: true,
      data: { messageId: 'message-1' },
    });
    const claim = await transport.request('channel-1', {
      type: 'claim_message',
      connectionId: 'connection-1',
      timeoutMs: 250,
      leaseMs: 300_000,
    });
    expect(claim).toMatchObject({
      ok: true,
      data: {
        type: 'message_claim',
        message: {
          messageId: 'message-1',
          conversationId: 'conversation-1',
          runId: 'run-1',
          content: 'Explain retrieval practice.',
        },
      },
    });
    await expect(
      transport.request('channel-1', {
        type: 'reply',
        connectionId: 'connection-1',
        runId: 'run-1',
        messageId: 'message-1',
        reply: { content: 'Retrieval practice strengthens later recall.' },
      }),
    ).resolves.toEqual({
      ok: true,
      data: { type: 'reply_recorded', messageId: 'message-1' },
    });

    expect(session.getSnapshot()).toMatchObject({
      connection: { status: 'connected', connectionId: 'connection-1' },
      run: { status: 'completed', runId: 'run-1' },
      items: [
        { kind: 'user', id: 'message-1', delivery: 'completed' },
        { kind: 'assistant', content: 'Retrieval practice strengthens later recall.' },
      ],
    });
  });

  it('rejects a second owner and requests from a foreign native channel', async () => {
    const transport = requestSource();
    const session = createLocalAiSession({
      source: transport.source,
      createId: (prefix) => `${prefix}-1`,
    });
    session.activate();
    const connect = {
      type: 'connect' as const,
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    };
    await transport.request('channel-1', connect);

    await expect(transport.request('channel-2', connect)).resolves.toMatchObject({
      ok: false,
      error: { kind: 'conflict' },
    });
    await expect(
      transport.request('channel-2', {
        type: 'heartbeat',
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'forbidden' } });
  });
});
