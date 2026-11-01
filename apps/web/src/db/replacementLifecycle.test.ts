import { describe, expect, it, vi } from 'vitest';
import { ReplacementLifecycle, type ReplacementParticipant } from './replacementLifecycle';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('ReplacementLifecycle', () => {
  it('admits shared work together, then serves an exclusive request before later shared work', async () => {
    const lifecycle = new ReplacementLifecycle();
    const releaseFirst = deferred();
    const releaseSecond = deferred();
    const order: string[] = [];

    const first = lifecycle.admitWrite(async () => {
      order.push('write-1:start');
      await releaseFirst.promise;
      order.push('write-1:end');
    });
    const second = lifecycle.admitWrite(async () => {
      order.push('write-2:start');
      await releaseSecond.promise;
      order.push('write-2:end');
    });
    const replacement = lifecycle.replace('peer', async () => {
      order.push('peer');
    });
    const later = lifecycle.admitWrite(async () => {
      order.push('write-3');
    });

    await Promise.resolve();
    expect(order).toEqual(['write-1:start', 'write-2:start']);

    releaseFirst.resolve();
    await first;
    expect(order).toEqual(['write-1:start', 'write-2:start', 'write-1:end']);

    releaseSecond.resolve();
    await Promise.all([second, replacement, later]);
    expect(order).toEqual([
      'write-1:start',
      'write-2:start',
      'write-1:end',
      'write-2:end',
      'peer',
      'write-3',
    ]);
  });

  it('invalidates a manual replacement synchronously, drains admitted work, then quiesces, applies and clears', async () => {
    const lifecycle = new ReplacementLifecycle();
    const releaseWrite = deferred();
    const order: string[] = [];
    const participant: ReplacementParticipant = {
      invalidate: vi.fn(() => order.push('invalidate')),
      quiesce: vi.fn(async () => {
        order.push('quiesce');
      }),
      clear: vi.fn(async () => {
        order.push('clear');
      }),
    };
    lifecycle.register(participant);

    const write = lifecycle.admitWrite(async () => {
      order.push('write:start');
      await releaseWrite.promise;
      order.push('write:end');
    });
    await Promise.resolve();

    const replacement = lifecycle.replace('manual', async () => {
      order.push('replace');
      return 'applied';
    });

    expect(order).toEqual(['write:start', 'invalidate']);
    expect(participant.quiesce).not.toHaveBeenCalled();

    releaseWrite.resolve();
    await expect(replacement).resolves.toBe('applied');
    await write;
    expect(order).toEqual([
      'write:start',
      'invalidate',
      'write:end',
      'quiesce',
      'replace',
      'clear',
    ]);
  });

  it('does not clear participant state when manual replacement fails', async () => {
    const lifecycle = new ReplacementLifecycle();
    const participant: ReplacementParticipant = {
      invalidate: vi.fn(),
      quiesce: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    lifecycle.register(participant);
    const failure = new Error('replace failed');

    await expect(
      lifecycle.replace('manual', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(participant.invalidate).toHaveBeenCalledOnce();
    expect(participant.quiesce).toHaveBeenCalledOnce();
    expect(participant.clear).not.toHaveBeenCalled();
  });

  it('does not apply a manual replacement when quiescence fails', async () => {
    const lifecycle = new ReplacementLifecycle();
    const failure = new Error('relay revocation failed');
    const operation = vi.fn();
    const participant: ReplacementParticipant = {
      invalidate: vi.fn(),
      quiesce: vi.fn().mockRejectedValue(failure),
      clear: vi.fn(),
    };
    lifecycle.register(participant);

    await expect(lifecycle.replace('manual', operation)).rejects.toBe(failure);

    expect(operation).not.toHaveBeenCalled();
    expect(participant.clear).not.toHaveBeenCalled();
  });

  it('rejects work admitted after manual invalidation instead of running it against replacement data', async () => {
    const lifecycle = new ReplacementLifecycle();
    const releaseWrite = deferred();
    const admitted = lifecycle.admitWrite(() => releaseWrite.promise);
    await Promise.resolve();
    const replacement = lifecycle.replace('manual', async () => undefined);

    await expect(lifecycle.admitWrite(async () => undefined)).rejects.toThrow(
      'A manual database replacement has invalidated this write.',
    );

    releaseWrite.resolve();
    await Promise.all([admitted, replacement]);
  });

  it.each(['peer', 'recovery'] as const)(
    'keeps participants intact during %s application',
    async (kind) => {
      const lifecycle = new ReplacementLifecycle();
      const participant: ReplacementParticipant = {
        invalidate: vi.fn(),
        quiesce: vi.fn(),
        clear: vi.fn(),
      };
      lifecycle.register(participant);

      await expect(lifecycle.replace(kind, async () => kind)).resolves.toBe(kind);

      expect(participant.invalidate).not.toHaveBeenCalled();
      expect(participant.quiesce).not.toHaveBeenCalled();
      expect(participant.clear).not.toHaveBeenCalled();
    },
  );

  it('unregisters a participant from later manual replacement', async () => {
    const lifecycle = new ReplacementLifecycle();
    const participant: ReplacementParticipant = {
      invalidate: vi.fn(),
      quiesce: vi.fn(),
      clear: vi.fn(),
    };
    const unregister = lifecycle.register(participant);
    unregister();

    await lifecycle.replace('manual', async () => undefined);

    expect(participant.invalidate).not.toHaveBeenCalled();
  });
});
