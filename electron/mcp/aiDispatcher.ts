import type {
  AiBridgeRequest,
  AiBridgeResult,
} from '../../src/ai/protocol.js';
import type { AiRendererReply, AiRendererRequest } from '../../src/mcp/companionProtocol.js';

export const AI_RENDERER_TIMEOUT_MS = 30_000;

interface PendingRequest {
  channelId: string;
  resolve: (result: AiBridgeResult) => void;
  timeout: ReturnType<typeof setTimeout>;
}

function unavailable(message: string): AiBridgeResult {
  return {
    ok: false,
    error: { kind: 'unavailable', reason: 'disconnected', message },
  };
}

export class AiRendererDispatcher {
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly timeoutMs = AI_RENDERER_TIMEOUT_MS) {}

  dispatch(
    channelId: string,
    id: string,
    request: AiBridgeRequest,
    send: (request: AiRendererRequest) => void,
  ): Promise<AiBridgeResult> {
    const key = this.key(channelId, id);
    if (this.pending.has(key)) {
      return Promise.resolve({
        ok: false,
        error: { kind: 'conflict', message: 'The AI request identifier is already in use.' },
      });
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        resolve(unavailable('Lacuna did not answer the local AI companion in time.'));
      }, this.timeoutMs);
      this.pending.set(key, { channelId, resolve, timeout });
      try {
        send({ channelId, id, request });
      } catch {
        this.settle(key, unavailable('The Lacuna renderer is unavailable.'));
      }
    });
  }

  resolve(reply: AiRendererReply): boolean {
    return this.settle(this.key(reply.channelId, reply.id), reply.result);
  }

  cancelChannel(channelId: string): void {
    for (const [key, pending] of this.pending) {
      if (pending.channelId === channelId) {
        this.settle(key, unavailable('The local AI companion disconnected.'));
      }
    }
  }

  close(): void {
    for (const key of [...this.pending.keys()]) {
      this.settle(key, unavailable('The local AI broker stopped.'));
    }
  }

  private key(channelId: string, id: string): string {
    return `${channelId}\0${id}`;
  }

  private settle(key: string, result: AiBridgeResult): boolean {
    const pending = this.pending.get(key);
    if (!pending) return false;
    clearTimeout(pending.timeout);
    this.pending.delete(key);
    pending.resolve(result);
    return true;
  }
}
