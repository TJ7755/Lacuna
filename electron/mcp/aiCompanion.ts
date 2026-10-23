import log from 'electron-log';
import { z } from 'zod';
import { McpServer, type CallToolResult, type ServerContext } from '@modelcontextprotocol/server';
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import {
  MAX_AI_IDENTIFIER_LENGTH,
  MAX_AI_MESSAGE_LENGTH,
  MAX_AI_WAIT_MS,
  MIN_AI_WAIT_MS,
  aiToolNameSchema,
  boundedJsonValueSchema,
  type AiClientIdentity,
} from '../../src/ai/protocol.js';
import {
  AiCompanionOperationError,
  companionErrorDetails,
} from '../../src/ai/companionErrors.js';
import {
  companionAppVersion,
  companionHostUserDataPath,
} from './connectionFile.js';
import { createLocalAiAppClient } from './aiAppClient.js';

const DEFAULT_WAIT_MS = MAX_AI_WAIT_MS;

export { LocalAiAppClient } from './aiAppClient.js';

function silenceStdoutNoise(): void {
  log.transports.console.level = false;
  const toStderr = (...args: unknown[]): void => {
    process.stderr.write(`${args.map(String).join(' ')}\n`);
  };
  // eslint-disable-next-line no-console -- stdout is reserved for MCP frames.
  console.log = toStderr;
  // eslint-disable-next-line no-console
  console.info = toStderr;
  // eslint-disable-next-line no-console
  console.debug = toStderr;
}

const identifierSchema = z.string().min(1).max(MAX_AI_IDENTIFIER_LENGTH);
const contentSchema = z.string().max(MAX_AI_MESSAGE_LENGTH)
  .refine((value) => value.trim().length > 0, 'Reply content must not be blank.');

function reportedIdentity(server: McpServer, context: ServerContext): AiClientIdentity {
  void context;
  const reported = server.server.getClientVersion();
  return {
    name: reported?.name ?? 'MCP client',
    ...(reported?.version ? { version: reported.version } : {}),
  };
}

export async function callAiCompanionTool<T extends object>(operation: () => Promise<T>): Promise<CallToolResult> {
  try {
    const data = await operation();
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
    };
  } catch (error) {
    const details = companionErrorDetails(error);
    const data = { ok: false as const, error: details };
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
    };
  }
}

export interface AiCompanionOptions {
  appVersion: string;
  hostUserDataPath: string;
}

export function startAiCompanion(options?: AiCompanionOptions): StdioServerHandle {
  silenceStdoutNoise();
  const appVersion = options?.appVersion ?? companionAppVersion(process.argv, '0.0.0');
  const hostUserDataPath = options?.hostUserDataPath ?? companionHostUserDataPath(process.argv, '');
  if (!hostUserDataPath) throw new Error('The Lacuna host profile was not provided.');
  const appClient = createLocalAiAppClient(hostUserDataPath);
  return serveStdio(() => {
    const server = new McpServer({ name: 'lacuna-ai', version: appVersion });
    server.registerTool(
      'lacuna.connect',
      {
        description: 'Connect this terminal task to the local AI session in the running Lacuna app.',
        inputSchema: z.object({}).strict(),
      },
      async (_input, context) => callAiCompanionTool(() => appClient.connect(reportedIdentity(server, context), context.mcpReq.signal)),
    );
    server.registerTool(
      'lacuna.wait_for_message',
      {
        description: 'Wait for and claim one queued local Lacuna AI message. Empty waits are normal; call again while connected.',
        inputSchema: z.object({
          timeoutMs: z.number().int().min(MIN_AI_WAIT_MS).max(MAX_AI_WAIT_MS).optional(),
        }).strict(),
      },
      async (input, context) => callAiCompanionTool(() => appClient.waitForMessage(input.timeoutMs ?? DEFAULT_WAIT_MS, context.mcpReq.signal)),
    );
    server.registerTool(
      'lacuna.invoke_tool',
      {
        description: 'Invoke one authorised Lacuna domain tool for the active local AI run.',
        inputSchema: z.object({
          runId: identifierSchema,
          callId: identifierSchema,
          toolName: aiToolNameSchema,
          input: z.unknown(),
          timeoutMs: z.number().int().min(MIN_AI_WAIT_MS).max(MAX_AI_WAIT_MS).optional(),
        }).strict(),
      },
      async (input, context) => callAiCompanionTool(async () => {
        const parsedInput = boundedJsonValueSchema.safeParse(input.input);
        if (!parsedInput.success) {
          throw new AiCompanionOperationError({
            kind: 'validation',
            message: 'The Lacuna AI tool input is invalid.',
            retryable: false,
            suggestedAction: 'inspect_input',
            userActionRequired: false,
            commitState: 'not_started',
          });
        }
        return {
          runId: input.runId,
          callId: input.callId,
          ...(await appClient.invokeTool(
            input.runId,
            input.callId,
            input.toolName,
            parsedInput.data,
            input.timeoutMs ?? MAX_AI_WAIT_MS,
            context.mcpReq.signal,
          )),
        };
      }),
    );
    server.registerTool(
      'lacuna.reply',
      {
        description: 'Send one complete reply for the exact claimed local Lacuna AI message.',
        inputSchema: z.object({
          runId: identifierSchema,
          messageId: identifierSchema,
          content: contentSchema,
        }).strict(),
      },
      async (input, context) => callAiCompanionTool(async () => {
        await appClient.reply(input.runId, input.messageId, input.content, context.mcpReq.signal);
        return { replied: true, runId: input.runId, messageId: input.messageId };
      }),
    );
    server.registerTool(
      'lacuna.disconnect',
      { description: 'Disconnect this terminal task from local Lacuna AI.', inputSchema: z.object({}).strict() },
      async (_input, context) => callAiCompanionTool(async () => {
        await appClient.disconnect(context.mcpReq.signal);
        return { disconnected: true };
      }),
    );
    server.server.onclose = () => appClient.close();
    return server;
  }, {
    legacy: 'serve',
    onerror: (error) => log.error('Local AI companion stdio failed', error),
  });
}
