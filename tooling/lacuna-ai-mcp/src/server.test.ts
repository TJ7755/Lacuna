import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiClientIdentity, JsonValue } from '../../../src/ai/protocol';
import type { WaitForMessageResult } from './client';
import { createLacunaAiMcpServer, type TerminalAiToolClient } from './server';

class FakeAiClient implements TerminalAiToolClient {
  private static readonly connectionAuth = Symbol('connection-auth');

  readonly connect = vi.fn(
    async (_code: string, relayUrl: string | undefined, _identity: AiClientIdentity) => ({
      sessionId: 'ABCDEFGHJKMNPQRSTVW2',
      relayUrl: relayUrl ?? 'https://lacuna-relay.vercel.app',
      expiresAt: 90_000,
      [FakeAiClient.connectionAuth]: { terminalToken: 'must-not-leak' },
    }),
  );
  readonly waitForMessage = vi.fn(
    async (_timeoutMs?: number): Promise<WaitForMessageResult> => ({ type: 'empty' }),
  );
  readonly reply = vi.fn(async (_runId: string, _messageId: string, _content: string) => {});
  readonly invokeTool = vi.fn(
    async (
      _runId: string,
      _callId: string,
      _toolName: string,
      _input: JsonValue,
      _timeoutMs?: number,
    ) => ({ ok: true as const, result: { courses: [] } }),
  );
  readonly disconnect = vi.fn(async () => {});
}

describe('Lacuna AI MCP server', () => {
  const openClients: Client[] = [];

  afterEach(async () => {
    await Promise.all(openClients.splice(0).map((client) => client.close()));
  });

  async function connectedServer(aiClient: TerminalAiToolClient) {
    const server = createLacunaAiMcpServer(aiClient);
    const client = new Client({ name: 'OpenCode', version: '1.2.3' });
    openClients.push(client);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { client, server };
  }

  it('exposes the small terminal companion tools, including one generic invocation tool', async () => {
    const { client } = await connectedServer(new FakeAiClient());

    await expect(client.listTools()).resolves.toMatchObject({
      tools: [
        { name: 'lacuna.connect' },
        { name: 'lacuna.wait_for_message' },
        { name: 'lacuna.reply' },
        { name: 'lacuna.invoke_tool' },
        { name: 'lacuna.disconnect' },
      ],
    });
  });

  it('passes the reported MCP identity into connect and returns structured results', async () => {
    const aiClient = new FakeAiClient();
    const { client } = await connectedServer(aiClient);

    const result = await client.callTool({
      name: 'lacuna.connect',
      arguments: { code: 'ABCD-EFGH-JKMN-PQRS-TVW2' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      sessionId: 'ABCDEFGHJKMNPQRSTVW2',
      relayUrl: 'https://lacuna-relay.vercel.app',
      expiresAt: 90_000,
    });
    expect(Object.getOwnPropertySymbols(result.structuredContent ?? {})).toHaveLength(0);
    expect(aiClient.connect).toHaveBeenCalledWith('ABCD-EFGH-JKMN-PQRS-TVW2', undefined, {
      name: 'OpenCode',
      version: '1.2.3',
    });
  });

  it('validates bounded waits and exact reply identifiers before dispatch', async () => {
    const aiClient = new FakeAiClient();
    const { client } = await connectedServer(aiClient);

    await expect(
      client.callTool({ name: 'lacuna.wait_for_message', arguments: { timeoutMs: 25_001 } }),
    ).resolves.toMatchObject({ isError: true });
    await expect(
      client.callTool({
        name: 'lacuna.reply',
        arguments: { runId: '', messageId: 'message-1', content: 'Done.' },
      }),
    ).resolves.toMatchObject({ isError: true });
    expect(aiClient.waitForMessage).not.toHaveBeenCalled();
    expect(aiClient.reply).not.toHaveBeenCalled();
  });

  it('validates the lacuna namespace and returns structured tool outcomes', async () => {
    const aiClient = new FakeAiClient();
    const { client } = await connectedServer(aiClient);

    const result = await client.callTool({
      name: 'lacuna.invoke_tool',
      arguments: {
        runId: 'run-1',
        callId: 'call-1',
        toolName: 'lacuna.list_courses',
        input: {},
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      runId: 'run-1',
      callId: 'call-1',
      ok: true,
      result: { courses: [] },
    });
    expect(aiClient.invokeTool).toHaveBeenCalledWith(
      'run-1',
      'call-1',
      'lacuna.list_courses',
      {},
      undefined,
    );

    await expect(
      client.callTool({
        name: 'lacuna.invoke_tool',
        arguments: { runId: 'run-1', callId: 'call-1', toolName: 'read_courses', input: {} },
      }),
    ).resolves.toMatchObject({ isError: true });
  });
});
