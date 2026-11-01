import type { RelayBrowserMailbox } from '../../../apps/web/src/ai/relayProtocol.js';
import type { ConnectedTerminalRelay, TerminalRelayTransport } from './terminalContracts.js';

class TerminalInvocationBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalInvocationBoundaryError';
  }
}

/** Carries the original invocation deadline through every transport operation and retry. */
export class TerminalInvocationBudget {
  constructor(
    private readonly transport: TerminalRelayTransport,
    private readonly now: () => number,
    private readonly sleep: (milliseconds: number) => Promise<void>,
  ) {}
  readBrowserMailboxUntil(
    connection: ConnectedTerminalRelay,
    deadline: number,
    signal?: AbortSignal,
  ): Promise<{ generation: string; mailbox: RelayBrowserMailbox } | null> {
    return this.awaitUntil(
      (boundedSignal) => this.transport.readBrowserMailbox(connection, boundedSignal),
      deadline,
      signal,
    );
  }

  async sleepUntil(delayMs: number, deadline: number, signal?: AbortSignal): Promise<void> {
    const remaining = this.requireRemaining(deadline);
    await this.awaitUntil(() => this.sleep(Math.min(delayMs, remaining)), deadline, signal);
    this.requireRemaining(deadline);
  }

  async awaitUntil<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    deadline: number,
    signal?: AbortSignal,
  ): Promise<T> {
    this.throwIfCancelled(signal);
    const remaining = this.requireRemaining(deadline);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(), remaining);
    const interrupted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => {
          reject(signal?.aborted ? this.cancelledError() : this.timedOutError());
        },
        { once: true },
      );
    });
    try {
      return await Promise.race([operation(controller.signal), interrupted]);
    } catch (error) {
      if (controller.signal.aborted) {
        throw signal?.aborted ? this.cancelledError() : this.timedOutError();
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
    }
  }

  throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) throw this.cancelledError();
  }

  requireRemaining(deadline: number): number {
    const remaining = deadline - this.now();
    if (remaining <= 0) throw this.timedOutError();
    return remaining;
  }

  cancelledError(): TerminalInvocationBoundaryError {
    return new TerminalInvocationBoundaryError('The Lacuna AI request was cancelled.');
  }

  timedOutError(): TerminalInvocationBoundaryError {
    return new TerminalInvocationBoundaryError('Timed out waiting for the Lacuna AI tool result.');
  }

  isBoundedOperationError(error: unknown): boolean {
    return error instanceof TerminalInvocationBoundaryError;
  }
}
