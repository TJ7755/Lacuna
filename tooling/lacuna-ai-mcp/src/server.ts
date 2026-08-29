import { McpServer, type CallToolResult, type ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  MAX_AI_IDENTIFIER_LENGTH,
  MAX_AI_MESSAGE_LENGTH,
  MAX_AI_WAIT_MS,
  MIN_AI_WAIT_MS,
  aiToolNameSchema,
  boundedJsonValueSchema,
  type JsonValue,
  type AiClientIdentity,
} from '../../../src/ai/protocol.js';
import { relayPairingCodeSchema } from '../../../src/ai/relayProtocol.js';
import type {
  ConnectedTerminalRelay,
  TerminalToolResponse,
  WaitForMessageResult,
} from './client.js';
import { normaliseRelayUrl } from './relayTransport.js';

export interface TerminalAiToolClient {
  connect(
    code: string,
    relayUrl: string | undefined,
    identity: AiClientIdentity,
  ): Promise<ConnectedTerminalRelay>;
  waitForMessage(timeoutMs?: number): Promise<WaitForMessageResult>;
  reply(runId: string, messageId: string, content: string): Promise<void>;
  invokeTool(
    runId: string,
    callId: string,
    toolName: string,
    input: JsonValue,
    timeoutMs?: number,
  ): Promise<TerminalToolResponse>;
  disconnect(): Promise<void>;
}

const relayUrlSchema = z.string().refine((value) => {
  try {
    normaliseRelayUrl(value);
    return true;
  } catch {
    return false;
  }
}, 'Expected an HTTPS relay URL, or HTTP on loopback.');
const identifierSchema = z.string().min(1).max(MAX_AI_IDENTIFIER_LENGTH);
const contentSchema = z
  .string()
  .max(MAX_AI_MESSAGE_LENGTH)
  .refine((value) => value.trim().length > 0, 'Reply content must not be blank.');

export function createLacunaAiMcpServer(client: TerminalAiToolClient): McpServer {
  const server = new McpServer({ name: 'lacuna-ai', version: '0.1.0' });

  server.registerTool(
    'lacuna.connect',
    {
      description: 'Connect this terminal task to an AI session already open in Lacuna.',
      inputSchema: z
        .object({ code: relayPairingCodeSchema, relayUrl: relayUrlSchema.optional() })
        .strict(),
    },
    async (input, context) =>
      callTool(async () => {
        const connection = await client.connect(
          input.code,
          input.relayUrl,
          reportedIdentity(server, context),
        );
        return {
          sessionId: connection.sessionId,
          relayUrl: connection.relayUrl,
          expiresAt: connection.expiresAt,
        };
      }),
  );

  server.registerTool(
    'lacuna.wait_for_message',
    {
      description:
        'Wait for and claim one queued Lacuna sidebar message. Honour the returned versioned ' +
        'instructions for that message. Empty waits are normal; call again while connected.',
      inputSchema: z
        .object({
          timeoutMs: z.number().int().min(MIN_AI_WAIT_MS).max(MAX_AI_WAIT_MS).optional(),
        })
        .strict(),
    },
    async (input) => callTool(() => client.waitForMessage(input.timeoutMs)),
  );

  server.registerTool(
    'lacuna.reply',
    {
      description: 'Send one complete, non-streamed reply for the exact claimed Lacuna message.',
      inputSchema: z
        .object({
          runId: identifierSchema,
          messageId: identifierSchema,
          content: contentSchema,
        })
        .strict(),
    },
    async (input) =>
      callTool(async () => {
        await client.reply(input.runId, input.messageId, input.content);
        return { replied: true, runId: input.runId, messageId: input.messageId };
      }),
  );

  server.registerTool(
    'lacuna.invoke_tool',
    {
      description:
        'Invoke one authorised Lacuna domain tool for the active run and wait for its structured result.',
      inputSchema: z
        .object({
          runId: identifierSchema,
          callId: identifierSchema,
          toolName: aiToolNameSchema,
          input: z.unknown(),
          timeoutMs: z.number().int().min(MIN_AI_WAIT_MS).max(MAX_AI_WAIT_MS).optional(),
        })
        .strict(),
    },
    async (input) =>
      callTool(async () => {
        const parsedInput = boundedJsonValueSchema.safeParse(input.input);
        if (!parsedInput.success) throw new Error('The Lacuna AI tool input is invalid.');
        return {
          runId: input.runId,
          callId: input.callId,
          ...(await client.invokeTool(
            input.runId,
            input.callId,
            input.toolName,
            parsedInput.data,
            input.timeoutMs,
          )),
        };
      }),
  );

  server.registerTool(
    'lacuna.disconnect',
    {
      description: 'Disconnect this terminal task from the current Lacuna AI session.',
      inputSchema: z.object({}).strict(),
    },
    async () =>
      callTool(async () => {
        await client.disconnect();
        return { disconnected: true };
      }),
  );

  return server;
}

function reportedIdentity(server: McpServer, context: ServerContext): AiClientIdentity {
  void context;
  const reported = server.server.getClientVersion();
  return {
    name: reported?.name ?? 'MCP client',
    ...(reported?.version ? { version: reported.version } : {}),
  };
}

async function callTool<T extends object>(operation: () => Promise<T>): Promise<CallToolResult> {
  try {
    const data = await operation();
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Lacuna AI companion failed.';
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}
