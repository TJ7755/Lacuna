import { describe, expect, it } from 'vitest';
import {
  CompanionLineDecoder,
  MCP_COMPANION_PROTOCOL_VERSION,
  encodeCompanionMessage,
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
  });
});
