import { createServer, type Server, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionLineDecoder, encodeCompanionMessage } from './companionProtocol';
import { LACUNA_AI_PROTOCOL_VERSION, type AiBridgeRequest } from '../ai/protocol';
import { writeCompanionConnectionFile } from '../../electron/mcp/connectionFile';

let userDataPath = '';

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataPath,
    getVersion: () => '0.2.2',
  },
}));

vi.mock('electron-log', () => ({
  default: {
    transports: { console: { level: 'info' } },
    error: vi.fn(),
  },
}));

import { callAiCompanionTool, LocalAiAppClient } from '../../electron/mcp/aiCompanion';
import { AiCompanionOperationError } from '../ai/companionErrors';

const temporaryDirectories: string[] = [];
const servers: Server[] = [];
const sockets: Socket[] = [];

beforeEach(async () => {
  userDataPath = await mkdtemp(path.join(os.tmpdir(), 'lacuna-ai-client-test-'));
  temporaryDirectories.push(userDataPath);
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local AI companion request lifecycle', () => {
  it('returns structured, actionable and redacted MCP errors', async () => {
    const result = await callAiCompanionTool(async () => {
      throw new AiCompanionOperationError({
        kind: 'renderer_unavailable',
        message: 'Lacuna AI is not ready.',
        retryable: true,
        suggestedAction: 'restart_ai_runtime',
        userActionRequired: true,
        commitState: 'not_started',
      });
    });

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          kind: 'renderer_unavailable',
          retryable: true,
          suggestedAction: 'restart_ai_runtime',
          userActionRequired: true,
          commitState: 'not_started',
        },
      },
    });

    const privateFailure = await callAiCompanionTool(async () => {
      throw new Error('/Users/Private/Library/Application Support/Lacuna');
    });
    expect(JSON.stringify(privateFailure)).not.toContain('/Users/Private');
  });

  it('reports a pre-aborted request as cancelled without opening the app socket', async () => {
    const abort = new AbortController();
    abort.abort();
    const client = new LocalAiAppClient(100, userDataPath);

    const result = await callAiCompanionTool(() =>
      client.connect({ name: 'Codex' }, abort.signal),
    );

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          kind: 'cancelled',
          retryable: true,
          commitState: 'not_started',
        },
      },
    });
  });

  it('drains an aborted tool request on the existing channel so a callId retry remains ledger-safe', async () => {
    const connection = await writeCompanionConnectionFile(userDataPath, '0.2.2');
    let handshakes = 0;
    let connects = 0;
    let firstToolRequestId = '';
    let releaseFirstToolResponse: (() => void) | undefined;
    const firstToolArrived = new Promise<void>((resolve) => { releaseFirstToolResponse = resolve; });
    let releaseStuckTool: (() => void) | undefined;
    const stuckToolArrived = new Promise<void>((resolve) => { releaseStuckTool = resolve; });
    let releaseSocketClosed: (() => void) | undefined;
    const socketClosed = new Promise<void>((resolve) => { releaseSocketClosed = resolve; });
    const receivedToolRequests: Array<{ id: string; connectionId: string; callId: string }> = [];
    const server = createServer((socket) => {
      sockets.push(socket);
      socket.once('close', () => releaseSocketClosed?.());
      const decoder = new CompanionLineDecoder();
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        for (const value of decoder.push(chunk)) {
          const message = value as {
            type: string;
            id?: string;
            request?: AiBridgeRequest;
          };
          if (message.type === 'ai_hello') {
            handshakes += 1;
            socket.write(encodeCompanionMessage({
              type: 'ai_ready',
              protocolVersion: connection.protocolVersion,
              appVersion: connection.appVersion,
            }));
            continue;
          }
          const request = message.request;
          if (!request || !message.id) continue;
          if (request.type === 'connect') {
            connects += 1;
            socket.write(encodeCompanionMessage({
              type: 'ai_result',
              id: message.id,
              result: {
                ok: true,
                data: {
                  type: 'connection',
                  connectionId: 'connection-1',
                  client: request.client,
                  connectedAt: 1,
                },
              },
            }));
            continue;
          }
          if (request.type === 'invoke_tool') {
            receivedToolRequests.push({
              id: message.id,
              connectionId: request.connectionId,
              callId: request.callId,
            });
            if (request.callId === 'call-stuck') {
              releaseStuckTool?.();
              continue;
            }
            if (!firstToolRequestId) {
              firstToolRequestId = message.id;
              releaseFirstToolResponse?.();
              continue;
            }
            socket.write(encodeCompanionMessage({
              type: 'ai_result',
              id: message.id,
              result: {
                ok: true,
                data: { type: 'tool_result', callId: request.callId, result: { cardId: 'card-1' } },
              },
            }));
          }
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(connection.endpoint, resolve);
    });

    const client = new LocalAiAppClient(100, userDataPath);
    await client.connect({ name: 'Codex' }, new AbortController().signal);
    const abort = new AbortController();
    const abandoned = client.invokeTool(
      'run-1',
      'call-1',
      'lacuna.create_card',
      {},
      5_000,
      abort.signal,
    );
    await firstToolArrived;
    abort.abort();
    await expect(abandoned).rejects.toThrow('cancelled');

    sockets[0].write(encodeCompanionMessage({
      type: 'ai_result',
      id: firstToolRequestId,
      result: {
        ok: true,
        data: { type: 'tool_result', callId: 'call-1', result: { cardId: 'card-1' } },
      },
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(client.invokeTool(
      'run-1',
      'call-1',
      'lacuna.create_card',
      {},
      5_000,
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: true, result: { cardId: 'card-1' } });

    expect(handshakes).toBe(1);
    expect(connects).toBe(1);
    expect(receivedToolRequests).toEqual([
      expect.objectContaining({ connectionId: 'connection-1', callId: 'call-1' }),
      expect.objectContaining({ connectionId: 'connection-1', callId: 'call-1' }),
    ]);

    const stuckAbort = new AbortController();
    const stuck = client.invokeTool(
      'run-1',
      'call-stuck',
      'lacuna.create_card',
      {},
      5_000,
      stuckAbort.signal,
    );
    await stuckToolArrived;
    stuckAbort.abort();
    await expect(stuck).rejects.toThrow('cancelled');
    await expect(socketClosed).resolves.toBeUndefined();
    client.close();
  });

  it('renews a claimed message lease while the model is working', async () => {
    const connection = await writeCompanionConnectionFile(userDataPath, '0.2.2');
    let resolveRenewed: (() => void) | undefined;
    const renewed = new Promise<void>((resolve) => { resolveRenewed = resolve; });
    const server = createServer((socket) => {
      sockets.push(socket);
      const decoder = new CompanionLineDecoder();
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        for (const value of decoder.push(chunk)) {
          const message = value as { type: string; id?: string; request?: AiBridgeRequest };
          if (message.type === 'ai_hello') {
            socket.write(encodeCompanionMessage({
              type: 'ai_ready',
              protocolVersion: connection.protocolVersion,
              appVersion: connection.appVersion,
            }));
            continue;
          }
          if (!message.id || !message.request) continue;
          const request = message.request;
          if (request.type === 'connect') {
            socket.write(encodeCompanionMessage({
              type: 'ai_result',
              id: message.id,
              result: {
                ok: true,
                data: {
                  type: 'connection',
                  connectionId: 'connection-1',
                  client: request.client,
                  connectedAt: 1,
                },
              },
            }));
          } else if (request.type === 'claim_message') {
            socket.write(encodeCompanionMessage({
              type: 'ai_result',
              id: message.id,
              result: {
                ok: true,
                data: {
                  type: 'message_claim',
                  message: {
                    messageId: 'message-1',
                    conversationId: 'conversation-1',
                    runId: 'run-1',
                    content: 'Take your time.',
                    createdAt: 1,
                    claimedAt: 2,
                    leaseExpiresAt: 300_002,
                  },
                },
              },
            }));
          } else if (request.type === 'get_instructions') {
            socket.write(encodeCompanionMessage({
              type: 'ai_result',
              id: message.id,
              result: {
                ok: true,
                data: {
                  type: 'instructions',
                  protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
                  instructionVersion: 'teaching-v1',
                  content: 'Follow Lacuna instructions.',
                  misconceptionFirstEnabled: false,
                },
              },
            }));
          } else if (request.type === 'renew_lease') {
            resolveRenewed?.();
            socket.write(encodeCompanionMessage({
              type: 'ai_result',
              id: message.id,
              result: {
                ok: true,
                data: {
                  type: 'lease_renewed',
                  runId: request.runId,
                  leaseExpiresAt: 600_002,
                },
              },
            }));
          }
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(connection.endpoint, resolve);
    });

    const client = new LocalAiAppClient(100, userDataPath, 10);
    await client.connect({ name: 'Codex' }, new AbortController().signal);
    await client.waitForMessage(250, new AbortController().signal);

    await expect(renewed).resolves.toBeUndefined();
    client.close();
  });
});
