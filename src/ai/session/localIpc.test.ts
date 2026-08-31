import { describe, expect, it, vi } from 'vitest';
import { LACUNA_AI_PROTOCOL_VERSION } from '../protocol';
import { createElectronLocalAiRequestSource, type LocalAiPreloadApi } from './localIpc';

describe('Electron local AI request source', () => {
  it('forwards requests and channel disconnects through the narrow preload callback', async () => {
    let onRequest: Parameters<LocalAiPreloadApi['listen']>[0] | undefined;
    let onDisconnected: Parameters<LocalAiPreloadApi['listen']>[1] | undefined;
    const unsubscribe = vi.fn();
    const api: LocalAiPreloadApi = {
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      disconnect: vi.fn(),
      listen(request, disconnected) {
        onRequest = request;
        onDisconnected = disconnected;
        return unsubscribe;
      },
    };
    const source = createElectronLocalAiRequestSource(api);
    const handler = vi.fn(async () => ({
      ok: true as const,
      data: { type: 'disconnected' as const },
    }));
    const disconnected = vi.fn();
    const stop = source.listen(handler, disconnected);
    const request = {
      type: 'connect' as const,
      protocolVersion: LACUNA_AI_PROTOCOL_VERSION,
      client: { name: 'Codex' },
    };

    await expect(onRequest!('channel-1', request)).resolves.toEqual({
      ok: true,
      data: { type: 'disconnected' },
    });
    expect(handler).toHaveBeenCalledWith('channel-1', request);
    onDisconnected!('channel-1');
    expect(disconnected).toHaveBeenCalledWith('channel-1');
    source.disconnect?.('channel-1');
    expect(api.disconnect).toHaveBeenCalledWith('channel-1');

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
