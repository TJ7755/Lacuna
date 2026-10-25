import { vi } from 'vitest';
import { type AiBridgeRequest } from '../protocol';
import { type LocalAiRequestSource } from './local';

export function requestSource() {
  let handler: ((channelId: string, request: AiBridgeRequest) => Promise<unknown>) | undefined;
  let disconnected: ((channelId: string) => void) | undefined;
  const terminate = vi.fn();
  const source: LocalAiRequestSource = {
    disconnect: terminate,
    listen(next, onDisconnected) {
      handler = next;
      disconnected = onDisconnected;
      return () => {
        handler = undefined;
        disconnected = undefined;
      };
    },
  };
  return {
    source,
    request: (channelId: string, request: AiBridgeRequest) => handler!(channelId, request),
    disconnect: (channelId: string) => disconnected!(channelId),
    terminate,
    listening: () => handler !== undefined,
  };
}
