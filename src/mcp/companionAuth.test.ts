import { describe, expect, it } from 'vitest';
import { authoriseCompanionHello } from '../../electron/mcp/companionAuth';
import { MCP_COMPANION_PROTOCOL_VERSION } from './companionProtocol';

const dataToken = 'a'.repeat(64);
const aiToken = 'b'.repeat(64);

describe('companion authentication', () => {
  it('binds each token to one companion purpose', () => {
    const dataHello = {
      type: 'hello',
      protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
      token: dataToken,
      client: { connectionId: 'connection-1', name: 'Codex' },
    };
    const aiHello = {
      type: 'ai_hello',
      protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
      token: aiToken,
    };

    expect(authoriseCompanionHello(dataHello, 'data', dataToken)).toBe(true);
    expect(authoriseCompanionHello(dataHello, 'ai', aiToken)).toBe(false);
    expect(authoriseCompanionHello(aiHello, 'ai', aiToken)).toBe(true);
    expect(authoriseCompanionHello(aiHello, 'data', dataToken)).toBe(false);
    expect(authoriseCompanionHello({ ...dataHello, token: aiToken }, 'data', dataToken)).toBe(false);
    expect(authoriseCompanionHello({ ...aiHello, token: dataToken }, 'ai', aiToken)).toBe(false);
  });

  it('rejects malformed handshakes before comparing credentials', () => {
    expect(authoriseCompanionHello({ type: 'ai_hello', token: aiToken }, 'ai', aiToken)).toBe(false);
    expect(authoriseCompanionHello({
      type: 'ai_hello',
      protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
      token: aiToken,
      purpose: 'data',
    }, 'ai', aiToken)).toBe(false);
  });
});
