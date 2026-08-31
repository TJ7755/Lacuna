import type { McpToolError } from './bridge/protocol';
import type { McpClientIdentity } from './connections';
import {
  isAiBridgeError,
  isAiBridgeRequest,
  type AiBridgeRequest,
  type AiBridgeResult,
} from '../ai/protocol';

export const MCP_COMPANION_PROTOCOL_VERSION = 1;
export const MCP_COMPANION_MAX_MESSAGE_BYTES = 10 * 1024 * 1024;

export type CompanionRequest =
  | {
      type: 'hello';
      protocolVersion: typeof MCP_COMPANION_PROTOCOL_VERSION;
      token: string;
      client: McpClientIdentity;
    }
  | { type: 'call'; id: string; tool: string; input: unknown; client: McpClientIdentity };

export type CompanionResponse =
  | { type: 'ready'; protocolVersion: typeof MCP_COMPANION_PROTOCOL_VERSION; appVersion: string }
  | { type: 'result'; id: string; ok: true; result: unknown }
  | { type: 'result'; id: string; ok: false; error: McpToolError }
  | { type: 'fatal'; error: McpToolError };

export type AiCompanionRequest =
  | {
      type: 'ai_hello';
      protocolVersion: typeof MCP_COMPANION_PROTOCOL_VERSION;
      token: string;
    }
  | { type: 'ai_request'; id: string; request: AiBridgeRequest };

export type AiCompanionResponse =
  | {
      type: 'ai_ready';
      protocolVersion: typeof MCP_COMPANION_PROTOCOL_VERSION;
      appVersion: string;
    }
  | { type: 'ai_result'; id: string; result: AiBridgeResult }
  | { type: 'fatal'; error: McpToolError };

export interface AiRendererRequest {
  channelId: string;
  id: string;
  request: AiBridgeRequest;
}

export interface AiRendererReply {
  channelId: string;
  id: string;
  result: AiBridgeResult;
}

export interface AiRendererDisconnect {
  channelId: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

export function isMcpClientIdentity(value: unknown): value is McpClientIdentity {
  const item = record(value);
  return !!item && typeof item.connectionId === 'string' && item.connectionId.length > 0 &&
    typeof item.name === 'string' && item.name.length > 0 &&
    (item.version === undefined || typeof item.version === 'string');
}

export function isCompanionRequest(value: unknown): value is CompanionRequest {
  const item = record(value);
  if (!item || typeof item.type !== 'string') return false;
  if (item.type === 'hello') {
    return Object.keys(item).length === 4 &&
      item.protocolVersion === MCP_COMPANION_PROTOCOL_VERSION &&
      typeof item.token === 'string' && /^[a-f0-9]{64}$/.test(item.token) &&
      isMcpClientIdentity(item.client);
  }
  return item.type === 'call' && Object.keys(item).length === 5 &&
    typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.tool === 'string' && item.tool.length > 0 &&
    Object.prototype.hasOwnProperty.call(item, 'input') && isMcpClientIdentity(item.client);
}

export function isAiCompanionRequest(value: unknown): value is AiCompanionRequest {
  const item = record(value);
  if (!item) return false;
  if (item.type === 'ai_hello') {
    return Object.keys(item).length === 3 &&
      item.protocolVersion === MCP_COMPANION_PROTOCOL_VERSION &&
      typeof item.token === 'string' && /^[a-f0-9]{64}$/.test(item.token);
  }
  return item.type === 'ai_request' && Object.keys(item).length === 3 &&
    isIdentifier(item.id) && isAiBridgeRequest(item.request);
}

const AI_SUCCESS_TYPES = new Set([
  'connection',
  'instructions',
  'message_claim',
  'pending_messages',
  'run_state',
  'activity_recorded',
  'tool_result',
  'reply_recorded',
  'connection_state',
  'stop_acknowledged',
  'disconnected',
]);

function isAiBridgeResult(value: unknown): value is AiBridgeResult {
  const item = record(value);
  if (!item || typeof item.ok !== 'boolean') return false;
  if (!item.ok) return isAiBridgeError(item.error) && Object.keys(item).length === 2;
  const data = record(item.data);
  return Object.keys(item).length === 2 && !!data && typeof data.type === 'string' &&
    AI_SUCCESS_TYPES.has(data.type) && isPlainJson(value);
}

export function isAiRendererReply(value: unknown): value is AiRendererReply {
  const item = record(value);
  return !!item && Object.keys(item).length === 3 &&
    isIdentifier(item.channelId) && isIdentifier(item.id) && isAiBridgeResult(item.result);
}

export function isAiCompanionResponse(value: unknown): value is AiCompanionResponse {
  const item = record(value);
  if (!item) return false;
  if (item.type === 'ai_ready') {
    return Object.keys(item).length === 3 &&
      item.protocolVersion === MCP_COMPANION_PROTOCOL_VERSION && typeof item.appVersion === 'string';
  }
  if (item.type === 'ai_result') {
    return Object.keys(item).length === 3 && isIdentifier(item.id) && isAiBridgeResult(item.result);
  }
  return item.type === 'fatal' && Object.keys(item).length === 2 && isMcpToolError(item.error);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160;
}

function isMcpToolError(value: unknown): value is McpToolError {
  const item = record(value);
  return !!item && Object.keys(item).length === 2 &&
    (item.kind === 'not_found' || item.kind === 'validation' || item.kind === 'forbidden' ||
      item.kind === 'conflict' || item.kind === 'internal') &&
    typeof item.message === 'string' && item.message.length > 0;
}

function isPlainJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  const next = new Set(ancestors).add(value);
  return Object.values(value).every((entry) => isPlainJson(entry, next));
}

/** Newline framing is deliberately boring and bounded: one JSON object per line. */
export class CompanionLineDecoder {
  private buffered = '';

  push(chunk: string): unknown[] {
    this.buffered += chunk;
    if (new TextEncoder().encode(this.buffered).byteLength > MCP_COMPANION_MAX_MESSAGE_BYTES) {
      throw new Error('MCP companion message exceeded the 10 MiB limit.');
    }
    const messages: unknown[] = [];
    for (;;) {
      const newline = this.buffered.indexOf('\n');
      if (newline < 0) break;
      const line = this.buffered.slice(0, newline);
      this.buffered = this.buffered.slice(newline + 1);
      if (line.trim().length > 0) messages.push(JSON.parse(line));
    }
    return messages;
  }
}

export function encodeCompanionMessage(
  value: CompanionRequest | CompanionResponse | AiCompanionRequest | AiCompanionResponse,
): string {
  return `${JSON.stringify(value)}\n`;
}
