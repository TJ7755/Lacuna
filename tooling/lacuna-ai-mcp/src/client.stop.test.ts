import { describe, expect, it } from 'vitest';
import { type RelayBrowserMailbox } from '../../../apps/web/src/ai/relayProtocol';
import { TerminalAiClient } from './client';
import { FakeTransport, queuedMailbox } from './client.testHarness';

describe('TerminalAiClient', () => {
  it('refreshes Stop state before admitting a tool call', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => prefix + '-1',
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    transport.reads.push({
      generation: '"browser-2"',
      mailbox: {
        ...queuedMailbox(),
        revision: 2,
        messages: [
          { ...queuedMailbox().messages[0], delivery: 'stop_requested', runId: claimed.runId },
        ],
        toolResponses: [],
      },
    });

    await expect(
      client.invokeTool(claimed.runId, 'call-1', 'lacuna.list_courses', {}, 1_000),
    ).rejects.toThrow('tool call was not sent');
    expect(transport.writes.flatMap((mailbox) => mailbox.events)).not.toContainEqual(
      expect.objectContaining({ type: 'tool_call', callId: 'call-1' }),
    );
  });

  it('acknowledges a stop request for the active run instead of reclaiming it', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let now = 1_000;
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    transport.reads.push({
      generation: '"browser-2"',
      mailbox: {
        ...queuedMailbox(),
        revision: 2,
        terminalRevisionSeen: 1,
        toolResponses: [],
        messages: [
          {
            ...queuedMailbox().messages[0],
            delivery: 'stop_requested',
            runId: claimed.runId,
          },
        ],
      },
    });

    await expect(client.waitForMessage(25_000)).resolves.toEqual({
      type: 'stop_requested',
      messageId: claimed.messageId,
      runId: claimed.runId,
    });
    expect(transport.writes.at(-1)?.events.at(-1)).toEqual({
      type: 'stop_acknowledged',
      eventId: 'event-3',
      runId: claimed.runId,
      stoppedAt: 1_000,
    });
    await expect(client.reply(claimed.runId, claimed.messageId, 'Too late.')).rejects.toThrow(
      'not active',
    );
  });

  it('retries the same browser generation when publishing a Stop acknowledgement fails', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    const stoppedMailbox: RelayBrowserMailbox = {
      ...queuedMailbox(),
      revision: 2,
      terminalRevisionSeen: 1,
      toolResponses: [],
      messages: [
        {
          ...queuedMailbox().messages[0],
          delivery: 'stop_requested',
          runId: claimed.runId,
        },
      ],
    };
    transport.reads.push(
      { generation: '"browser-2"', mailbox: stoppedMailbox },
      { generation: '"browser-2"', mailbox: stoppedMailbox },
    );
    transport.writeError = new Error('relay write failed');

    await expect(client.waitForMessage(25_000)).rejects.toThrow('relay write failed');
    await expect(client.waitForMessage(25_000)).resolves.toEqual({
      type: 'stop_requested',
      messageId: claimed.messageId,
      runId: claimed.runId,
    });
    expect(transport.writes.at(-1)?.events.at(-1)).toEqual(
      expect.objectContaining({ type: 'stop_acknowledged', runId: claimed.runId }),
    );
  });

  it('refreshes Stop state immediately before refusing a late reply', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => 1_000,
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');
    transport.reads.push({
      generation: '"browser-2"',
      mailbox: {
        ...queuedMailbox(),
        revision: 2,
        terminalRevisionSeen: 1,
        toolResponses: [],
        messages: [
          {
            ...queuedMailbox().messages[0],
            delivery: 'stop_requested',
            runId: claimed.runId,
          },
        ],
      },
    });

    await expect(
      client.reply(claimed.runId, claimed.messageId, 'This reply arrived too late.'),
    ).rejects.toThrow('Stop was requested');
    expect(transport.writes.at(-1)?.events.at(-1)).toEqual(
      expect.objectContaining({ type: 'stop_acknowledged', runId: claimed.runId }),
    );
    expect(transport.writes.flatMap((mailbox) => mailbox.events)).not.toContainEqual(
      expect.objectContaining({ type: 'reply', runId: claimed.runId }),
    );
  });

  it('acknowledges Stop arriving after the pre-reply refresh but before reply publication', async () => {
    const transport = new FakeTransport();
    transport.reads.push({ generation: '"browser-1"', mailbox: queuedMailbox() });
    let now = 1_000;
    let sequence = 0;
    const client = new TerminalAiClient({
      transport,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      createId: (prefix) => `${prefix}-${++sequence}`,
    });
    await client.connect('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, { name: 'Test client' });
    const claimed = await client.waitForMessage(25_000);
    if (claimed.type !== 'message') throw new Error('Expected one claimed message.');

    transport.beforeWrite = (mailbox) => {
      if (mailbox.events.at(-1)?.type !== 'reply') return;
      transport.reads.push({
        generation: '"browser-2"',
        mailbox: {
          ...queuedMailbox(),
          revision: 2,
          terminalRevisionSeen: 1,
          toolResponses: [],
          messages: [
            {
              ...queuedMailbox().messages[0],
              delivery: 'stop_requested',
              runId: claimed.runId,
            },
          ],
        },
      });
    };

    await client.reply(claimed.runId, claimed.messageId, 'This reply lost the Stop race.');
    await expect(client.waitForMessage(1)).resolves.toEqual({
      type: 'stop_requested',
      messageId: claimed.messageId,
      runId: claimed.runId,
    });
    expect(transport.writes.at(-1)?.events.at(-1)).toEqual(
      expect.objectContaining({ type: 'stop_acknowledged', runId: claimed.runId }),
    );
  });
});
