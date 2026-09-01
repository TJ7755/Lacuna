import { describe, expect, it } from 'vitest';
import {
  AI_COMPANION_PROTOCOL_VERSION,
  CompanionLineDecoder,
  LEGACY_AI_COMPANION_PROTOCOL_VERSION,
  MCP_COMPANION_PROTOCOL_VERSION,
  encodeCompanionMessage,
  isAiCompanionRequest,
  isAiCompanionResponse,
  isAiRendererReply,
  isCompanionRequest,
} from './companionProtocol';

const client = { connectionId: 'connection-1', name: 'Codex', version: '1.0' };

describe('companion protocol', () => {
  it('decodes fragmented newline-delimited messages', () => {
    const decoder = new CompanionLineDecoder();
    const hello = encodeCompanionMessage({
      type: 'hello',
      protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
      token: 'a'.repeat(32),
      client,
    });
    expect(decoder.push(hello.slice(0, 8))).toEqual([]);
    expect(decoder.push(hello.slice(8))).toEqual([
      expect.objectContaining({ type: 'hello', client }),
    ]);
  });

  it('rejects unauthenticated or malformed requests', () => {
    expect(isCompanionRequest({ type: 'hello', protocolVersion: 1, token: 'short', client })).toBe(false);
    expect(isCompanionRequest({ type: 'call', id: '', tool: 'lacuna.list_courses', input: {}, client })).toBe(false);
    expect(isAiCompanionRequest({
      type: 'ai_hello',
      protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
      token: 'a'.repeat(64),
      unexpected: true,
    })).toBe(false);
    expect(isCompanionRequest({
      type: 'call',
      id: 'request-1',
      tool: `lacuna.${'x'.repeat(10_000)}`,
      input: {},
      client,
    })).toBe(false);
  });

  it('keeps AI and data-MCP sockets purpose-bound from the first handshake', () => {
    const mcpHello = {
      type: 'hello',
      protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
      token: 'a'.repeat(64),
      client,
    };
    const aiHello = {
      type: 'ai_hello',
      protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
      token: 'b'.repeat(64),
    };

    expect(isCompanionRequest(mcpHello)).toBe(true);
    expect(isAiCompanionRequest(mcpHello)).toBe(false);
    expect(isAiCompanionRequest(aiHello)).toBe(true);
    expect(isCompanionRequest(aiHello)).toBe(false);
    expect(isAiCompanionRequest({
      type: 'ai_request',
      id: 'request-1',
      request: {
        type: 'connect',
        protocolVersion: 1,
        client: { name: 'Codex', version: '1.0' },
      },
    })).toBe(true);
    expect(isAiCompanionRequest({
      type: 'call',
      id: 'request-1',
      tool: 'lacuna.list_courses',
      input: {},
      client,
    })).toBe(false);
  });

  it('negotiates lease renewal only on the versioned AI companion protocol', () => {
    expect(isAiCompanionRequest({
      type: 'ai_hello',
      protocolVersion: LEGACY_AI_COMPANION_PROTOCOL_VERSION,
      token: 'b'.repeat(64),
    })).toBe(true);
    expect(isAiCompanionRequest({
      type: 'ai_hello',
      protocolVersion: AI_COMPANION_PROTOCOL_VERSION,
      token: 'b'.repeat(64),
    })).toBe(true);
    expect(isAiCompanionResponse({
      type: 'ai_ready',
      protocolVersion: AI_COMPANION_PROTOCOL_VERSION,
      appVersion: '0.2.4',
      capabilities: { leaseRenewal: true },
    })).toBe(true);
    expect(isAiCompanionResponse({
      type: 'ai_ready',
      protocolVersion: LEGACY_AI_COMPANION_PROTOCOL_VERSION,
      appVersion: '0.2.3',
      capabilities: { leaseRenewal: true },
    })).toBe(false);
  });

  it('validates correlated AI results before they cross either IPC boundary', () => {
    const result = {
      ok: false,
      error: { kind: 'internal', message: 'The request timed out.' },
    } as const;

    expect(isAiRendererReply({ channelId: 'channel-1', id: 'request-1', result })).toBe(true);
    expect(isAiRendererReply({ channelId: '', id: 'request-1', result })).toBe(false);
    expect(isAiRendererReply({ channelId: 'channel-1', id: 'request-1', result: { ok: true } })).toBe(false);
    expect(isAiCompanionResponse({ type: 'ai_result', id: 'request-1', result })).toBe(true);
    expect(isAiCompanionResponse({ type: 'result', id: 'request-1', result })).toBe(false);
  });
});
