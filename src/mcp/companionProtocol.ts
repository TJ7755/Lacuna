import type { McpToolError } from './bridge/protocol';
import type { McpClientIdentity } from './connections';

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
    return item.protocolVersion === MCP_COMPANION_PROTOCOL_VERSION &&
      typeof item.token === 'string' && item.token.length >= 32 && isMcpClientIdentity(item.client);
  }
  return item.type === 'call' && typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.tool === 'string' && item.tool.length > 0 &&
    Object.prototype.hasOwnProperty.call(item, 'input') && isMcpClientIdentity(item.client);
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

export function encodeCompanionMessage(value: CompanionRequest | CompanionResponse): string {
  return `${JSON.stringify(value)}\n`;
}
