import { describe, expect, it, vi } from 'vitest';
import type { QuestionSetRecord } from './questionSetCodec';
import { QuestionSetRevisionConflictError } from './questionSetRepository';
import { createEmptyQuestionSetDraft, QuestionSetDraftConflictError } from './questionSetDrafts';
import {
  createQuestionSetDraftSession,
  type QuestionSetDraftSessionStorage,
} from './questionSetDraftSession';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function storage(
  overrides: Partial<QuestionSetDraftSessionStorage> = {},
): QuestionSetDraftSessionStorage {
  return {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn(async (draft, options) => ({
      ...draft,
      draftRevisionId: `${options.expectedDraftRevisionId ?? 'new'}-saved`,
      updatedAt: draft.updatedAt + 1,
    })),
    saveWithAssets: vi.fn(async (draft, _assets, options) => ({
      ...draft,
      draftRevisionId: `${options.expectedDraftRevisionId ?? 'new'}-saved-with-assets`,
      updatedAt: draft.updatedAt + 1,
    })),
    publish: vi.fn().mockResolvedValue({ id: 'set' } as QuestionSetRecord),
    ...overrides,
  };
}

describe('Question Set draft session', () => {
  it('loads a stored draft or falls back to the supplied initial draft', async () => {
    const initial = createEmptyQuestionSetDraft('course', 'set');
    const operations = storage();
    const session = createQuestionSetDraftSession({ initialDraft: initial, storage: operations });

    expect(await session.load()).toEqual(initial);
    expect(session.getSnapshot()).toMatchObject({ draft: initial, dirty: true, phase: 'idle' });
  });

  it('serialises saves and persists edits that arrive during an in-flight save', async () => {
    const initial = createEmptyQuestionSetDraft('course', 'set');
    const first = deferred<typeof initial>();
    const second = deferred<typeof initial>();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const session = createQuestionSetDraftSession({
      initialDraft: initial,
      storage: storage({ save }),
      debounceMs: 60_000,
    });
    await session.load();
    session.update((content) => ({ ...content, title: 'First edit' }));
    const flushing = session.flush();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    session.update((content) => ({ ...content, title: 'Second edit' }));
    first.resolve({
      ...initial,
      content: { ...initial.content, title: 'First edit' },
      draftRevisionId: 'r1',
    });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0].content.title).toBe('Second edit');
    expect(save.mock.calls[1][1]).toEqual({ expectedDraftRevisionId: 'r1' });
    second.resolve({
      ...initial,
      content: { ...initial.content, title: 'Second edit' },
      draftRevisionId: 'r2',
    });
    await flushing;

    expect(session.getSnapshot()).toMatchObject({ dirty: false, phase: 'idle' });
    expect(session.getSnapshot().draft?.content.title).toBe('Second edit');
  });

  it('keeps stale conflicts explicit and reloads before any retry', async () => {
    const initial = createEmptyQuestionSetDraft('course', 'set');
    const conflict = new QuestionSetDraftConflictError();
    const newer = {
      ...initial,
      draftRevisionId: 'newer',
      content: { ...initial.content, title: 'Other tab' },
    };
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(newer);
    const save = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockImplementation(async (draft) => ({ ...draft, draftRevisionId: 'ours' }));
    const session = createQuestionSetDraftSession({
      initialDraft: initial,
      storage: storage({ load, save }),
    });
    await session.load();
    session.update((content) => ({ ...content, title: 'Our stale edit' }));

    await expect(session.flush()).rejects.toBe(conflict);
    expect(session.getSnapshot()).toMatchObject({
      phase: 'error',
      error: conflict,
      dirty: true,
      requiresReload: true,
    });
    expect(() => session.update((content) => content)).toThrow(conflict);
    expect(save).toHaveBeenCalledTimes(1);

    await expect(session.load()).rejects.toThrow('Confirm discarding');
    await session.load({ discardLocalChanges: true });
    session.update((content) => ({ ...content, title: 'Edit after reload' }));
    await session.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1]).toEqual({ expectedDraftRevisionId: 'newer' });
  });

  it('debounces ordinary edits and publishes only the saved revision', async () => {
    vi.useFakeTimers();
    try {
      const initial = createEmptyQuestionSetDraft('course', 'set');
      const operations = storage();
      const session = createQuestionSetDraftSession({
        initialDraft: initial,
        storage: operations,
        debounceMs: 50,
      });
      const listener = vi.fn();
      session.subscribe(listener);
      await session.load();
      session.update((content) => ({ ...content, title: 'Paper' }));
      expect(operations.save).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      await vi.waitFor(() => expect(operations.save).toHaveBeenCalledOnce());
      await session.publish();

      expect(operations.publish).toHaveBeenCalledWith('course', 'set', 'new-saved');
      expect(session.getSnapshot()).toMatchObject({ draft: null, dirty: false, phase: 'idle' });
      expect(listener).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists an unchanged initial draft before publishing it', async () => {
    const operations = storage();
    const session = createQuestionSetDraftSession({
      initialDraft: createEmptyQuestionSetDraft('course', 'set'),
      storage: operations,
    });
    await session.load();

    await session.publish();

    expect(operations.save).toHaveBeenCalledOnce();
    expect(operations.publish).toHaveBeenCalledWith('course', 'set', 'new-saved');
  });

  it('retries transient save failures against the same expected revision', async () => {
    const transient = new Error('Storage unavailable');
    const save = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockImplementation(async (draft) => ({ ...draft, draftRevisionId: 'saved' }));
    const session = createQuestionSetDraftSession({
      initialDraft: createEmptyQuestionSetDraft('course', 'set'),
      storage: storage({ save }),
    });
    await session.load();

    await expect(session.flush()).rejects.toBe(transient);
    expect(session.getSnapshot()).toMatchObject({
      phase: 'error',
      error: transient,
      dirty: true,
      requiresReload: false,
    });
    await session.retry();

    expect(save.mock.calls[0][1]).toEqual({ expectedDraftRevisionId: null });
    expect(save.mock.calls[1][1]).toEqual({ expectedDraftRevisionId: null });
    expect(session.getSnapshot()).toMatchObject({ phase: 'idle', dirty: false });
  });

  it('keeps a validation failure editable before publishing again', async () => {
    const invalid = new Error('Invalid question set');
    const publish = vi
      .fn()
      .mockRejectedValueOnce(invalid)
      .mockResolvedValueOnce({ id: 'set' } as QuestionSetRecord);
    const session = createQuestionSetDraftSession({
      initialDraft: createEmptyQuestionSetDraft('course', 'set'),
      storage: storage({ publish }),
    });
    await session.load();
    await expect(session.publish()).rejects.toBe(invalid);

    session.update((content) => ({ ...content, title: 'Fixed' }));
    await session.publish();

    expect(publish).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot()).toMatchObject({ phase: 'idle', draft: null });
  });

  it('identifies a stale published base separately from a reloadable draft conflict', async () => {
    const conflict = new QuestionSetRevisionConflictError();
    const session = createQuestionSetDraftSession({
      initialDraft: createEmptyQuestionSetDraft('course', 'set'),
      storage: storage({ publish: vi.fn().mockRejectedValue(conflict) }),
    });
    await session.load();

    await expect(session.publish()).rejects.toBe(conflict);

    expect(session.getSnapshot()).toMatchObject({
      phase: 'error',
      error: conflict,
      requiresReload: false,
      conflictSource: 'published',
    });
  });

  it('flushes pending work before disposal', async () => {
    const operations = storage();
    const session = createQuestionSetDraftSession({
      initialDraft: createEmptyQuestionSetDraft('course', 'set'),
      storage: operations,
      debounceMs: 60_000,
    });
    await session.load();
    session.update((content) => ({ ...content, title: 'Keep me' }));

    await session.dispose();

    expect(operations.save).toHaveBeenCalledOnce();
    expect(session.getSnapshot().phase).toBe('disposed');
  });

  it('persists an uploaded image and its Markdown reference in one save', async () => {
    const initial = createEmptyQuestionSetDraft('course', 'set');
    initial.content.questions = [{ id: 'q1', prompt: 'Stem', parts: [] }];
    const operations = storage();
    const asset = {
      hash: 'a'.repeat(64),
      blob: new Uint8Array([1]),
      mimeType: 'image/png',
      kind: 'image' as const,
      width: 10,
      height: 20,
      createdAt: 1,
    };
    const session = createQuestionSetDraftSession({
      initialDraft: initial,
      storage: operations,
      prepareImage: vi.fn().mockResolvedValue(asset),
    });
    await session.load();

    const url = await session.insertImage(
      'q1',
      new File(['image'], 'cell.png', { type: 'image/png' }),
      'Cell membrane',
    );

    expect(url).toBe(`lacuna-asset://${asset.hash}`);
    expect(operations.saveWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          questions: [
            expect.objectContaining({
              prompt: `Stem\n\n![Cell membrane](lacuna-asset://${asset.hash})`,
            }),
          ],
        }),
      }),
      [asset],
      { expectedDraftRevisionId: null },
    );
    expect(operations.save).not.toHaveBeenCalled();
  });

  it('does not revive a session disposed while loading', async () => {
    const pending = deferred<ReturnType<typeof createEmptyQuestionSetDraft> | null>();
    const session = createQuestionSetDraftSession({
      initialDraft: createEmptyQuestionSetDraft('course', 'set'),
      storage: storage({ load: vi.fn().mockReturnValue(pending.promise) }),
    });
    const loading = session.load();
    await session.dispose();
    pending.resolve(null);

    await expect(loading).rejects.toThrow('disposed');
    expect(session.getSnapshot().phase).toBe('disposed');
  });
});
