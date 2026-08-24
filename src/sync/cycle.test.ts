import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile, CourseRecord } from '../db/types';
import { openState, sealState } from './crypto';
import {
  __resetSyncFlightForTests,
  SYNC_FRESHNESS_POLICY,
  syncCycle,
  type SyncCycleOptions,
} from './cycle';
import { EMPTY_GENERATION, StaleGenerationError, type RelayProvider } from './relay';
import {
  decodeSnapshot,
  encodeSnapshot,
  SYNC_PLATFORM_BODY_LIMIT_BYTES,
  SyncSnapshotTooLargeError,
} from './snapshot';

const {
  exportDatabaseMock,
  readSyncStateMock,
  updateSyncStateMock,
  writeSyncStateMock,
  manualMergeMock,
  MockManualMergeError,
} = vi.hoisted(() => {
  class ManualMergeErrorForTest extends Error {
    readonly databaseModified: boolean;
    readonly causeError?: unknown;

    constructor(
      message: string,
      options: { databaseModified?: boolean; causeError?: unknown } = {},
    ) {
      super(message);
      this.name = 'ManualMergeError';
      this.databaseModified = options.databaseModified ?? false;
      this.causeError = options.causeError;
    }
  }
  return {
    exportDatabaseMock: vi.fn(),
    readSyncStateMock: vi.fn(),
    updateSyncStateMock: vi.fn(),
    writeSyncStateMock: vi.fn(),
    manualMergeMock: vi.fn(),
    MockManualMergeError: ManualMergeErrorForTest,
  };
});

vi.mock('../db/portability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/portability')>();
  return { ...actual, exportDatabase: exportDatabaseMock };
});

vi.mock('../db/mutationStamp', () => ({
  readSyncState: readSyncStateMock,
  updateSyncState: updateSyncStateMock,
  writeSyncState: writeSyncStateMock,
}));

vi.mock('./manualMerge', () => ({
  ManualMergeError: MockManualMergeError,
  manualMerge: manualMergeMock,
}));

const CHANNEL_ID = '0123456789abcdef0123456789abcdef';
const CHANNEL_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const NOW = 1_700_000_000_000;

function backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'lacuna',
    version: 10,
    exportedAt: 1,
    cards: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    ...overrides,
  };
}

function options(
  provider: RelayProvider,
  overrides: Partial<SyncCycleOptions> = {},
): SyncCycleOptions {
  return {
    provider,
    channelId: CHANNEL_ID,
    channelKey: CHANNEL_KEY,
    now: () => NOW,
    ...overrides,
  };
}

async function remoteBlob(snapshot: BackupFile, generation = '"generation-1"') {
  return {
    bytes: await sealState(CHANNEL_KEY, encodeSnapshot(snapshot), { channelId: CHANNEL_ID }),
    generation,
  };
}

function provider(overrides: Partial<RelayProvider> = {}): RelayProvider & {
  pull: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  purge: ReturnType<typeof vi.fn>;
} {
  return {
    pull: vi.fn().mockResolvedValue(null),
    push: vi.fn().mockResolvedValue({ generation: '"generation-2"' }),
    purge: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as RelayProvider & {
    pull: ReturnType<typeof vi.fn>;
    push: ReturnType<typeof vi.fn>;
    purge: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  __resetSyncFlightForTests();
  exportDatabaseMock.mockReset();
  readSyncStateMock.mockReset().mockResolvedValue(undefined);
  updateSyncStateMock.mockReset().mockImplementation(async (update) => {
    const current = await readSyncStateMock();
    const next = update(current);
    if (next !== undefined) await writeSyncStateMock(next);
  });
  writeSyncStateMock.mockReset().mockResolvedValue(undefined);
  manualMergeMock.mockReset();
  exportDatabaseMock.mockResolvedValue(backup());
  manualMergeMock.mockImplementation(
    async (
      _remote: BackupFile,
      mergeOptions: { beforeApply?: (candidate: BackupFile) => unknown },
    ) => {
      const candidate = backup();
      await mergeOptions.beforeApply?.(candidate);
      return {
        cards: { kept: 0, added: 0, removed: 0 },
        courses: { kept: 0, added: 0, removed: 0 },
        lessons: { kept: 0, added: 0, removed: 0 },
        reviewEvents: { kept: 0, added: 0, removed: 0 },
      };
    },
  );
});

describe('syncCycle', () => {
  it('pushes the first local snapshot against the empty generation', async () => {
    const local = backup({ exportedAt: 12 });
    exportDatabaseMock.mockResolvedValue(local);
    const relay = provider();

    const result = await syncCycle(options(relay));

    expect(relay.pull).toHaveBeenCalledWith('state');
    expect(relay.push).toHaveBeenCalledWith('state', expect.any(Uint8Array), EMPTY_GENERATION);
    const pushedBytes = relay.push.mock.calls[0]![1] as Uint8Array;
    const opened = await openState(CHANNEL_KEY, pushedBytes, { channelId: CHANNEL_ID });
    expect(decodeSnapshot(opened)).toEqual(local);
    expect(result).toMatchObject({
      attempts: 1,
      pulled: false,
      pushed: true,
      generation: '"generation-2"',
    });
    expect(result.snapshotBytes).toBe(pushedBytes.byteLength);
    expect(writeSyncStateMock).toHaveBeenLastCalledWith({
      channelId: CHANNEL_ID,
      lastPushedGeneration: '"generation-2"',
      lastSuccessfulSyncAt: NOW,
      lastSnapshotBytes: result.snapshotBytes,
      lastSnapshotPlaintextBytes: result.snapshotPlaintextBytes,
      lastError: null,
    });
    expect(SYNC_FRESHNESS_POLICY).toBe(
      'authenticated-local-merge-without-relay-rollback-protection',
    );
  });

  it('merges a remote snapshot but avoids a write when the merged state is unchanged', async () => {
    const remoteSnapshot = backup({
      exportedAt: 20,
      lessons: [
        {
          id: 'lesson-1',
          courseId: 'course-1',
          name: 'Lesson 1',
          orderIndex: 0,
          createdAt: 5,
          updatedAt: 5,
          isExtension: false,
        },
      ],
    });
    const relay = provider({ pull: vi.fn().mockResolvedValue(await remoteBlob(remoteSnapshot)) });

    manualMergeMock.mockImplementationOnce(
      async (
        _remote: BackupFile,
        mergeOptions: { beforeApply?: (candidate: BackupFile) => unknown },
      ) => {
        const candidate = {
          ...remoteSnapshot,
          exportedAt: 999,
          lessons: [
            {
              id: 'lesson-1',
              courseId: 'course-1',
              name: 'Lesson 1',
              orderIndex: 0,
              createdAt: 5,
              isExtension: false,
            },
          ],
        } as unknown as BackupFile;
        await mergeOptions.beforeApply?.(candidate);
        // importBackup normalises rows in place after the pre-apply hook
        // returns; stamping updatedAt makes the applied state match the
        // remote, so the cycle must compare and seal the post-import object.
        candidate.lessons![0]!.updatedAt = 5;
        return {
          cards: { kept: 0, added: 0, removed: 0 },
          courses: { kept: 0, added: 0, removed: 0 },
          lessons: { kept: 0, added: 0, removed: 0 },
          reviewEvents: { kept: 0, added: 0, removed: 0 },
        };
      },
    );

    const result = await syncCycle(options(relay));

    expect(manualMergeMock).toHaveBeenCalledWith(
      remoteSnapshot,
      expect.objectContaining({ beforeApply: expect.any(Function) }),
    );
    expect(relay.push).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      attempts: 1,
      pulled: true,
      pushed: false,
      generation: '"generation-1"',
    });
    expect(result.mergeSummary).not.toBeNull();
  });

  it('pushes a changed merged snapshot against the generation it pulled', async () => {
    const remoteSnapshot = backup({ exportedAt: 20 });
    const mergedSnapshot = backup({
      exportedAt: 21,
      courses: [{ id: 'course-1', name: 'Chemistry' } as CourseRecord],
    });
    const relay = provider({ pull: vi.fn().mockResolvedValue(await remoteBlob(remoteSnapshot)) });

    manualMergeMock.mockImplementationOnce(
      async (
        _remote: BackupFile,
        mergeOptions: { beforeApply?: (candidate: BackupFile) => unknown },
      ) => {
        await mergeOptions.beforeApply?.(mergedSnapshot);
        return {
          cards: { kept: 0, added: 0, removed: 0 },
          courses: { kept: 0, added: 1, removed: 0 },
          lessons: { kept: 0, added: 0, removed: 0 },
          reviewEvents: { kept: 0, added: 0, removed: 0 },
        };
      },
    );

    const result = await syncCycle(options(relay));

    expect(relay.push).toHaveBeenCalledWith('state', expect.any(Uint8Array), '"generation-1"');
    expect(result).toMatchObject({ pushed: true, generation: '"generation-2"' });
  });

  it('pulls again and retries once after a stale generation', async () => {
    const firstRemote = backup({ exportedAt: 10 });
    const secondRemote = backup({ exportedAt: 11 });
    const relay = provider({
      pull: vi
        .fn()
        .mockResolvedValueOnce(await remoteBlob(firstRemote, '"generation-1"'))
        .mockResolvedValueOnce(await remoteBlob(secondRemote, '"generation-2"')),
      push: vi
        .fn()
        .mockRejectedValueOnce(new StaleGenerationError('"generation-1"'))
        .mockResolvedValueOnce({ generation: '"generation-3"' }),
    });
    manualMergeMock
      .mockImplementationOnce(
        async (
          _remote: BackupFile,
          mergeOptions: { beforeApply?: (candidate: BackupFile) => unknown },
        ) => {
          await mergeOptions.beforeApply?.(
            backup({ exportedAt: 12, courses: [{ id: 'one', name: 'One' } as CourseRecord] }),
          );
          return {
            cards: { kept: 0, added: 0, removed: 0 },
            courses: { kept: 0, added: 1, removed: 0 },
            lessons: { kept: 0, added: 0, removed: 0 },
            reviewEvents: { kept: 0, added: 0, removed: 0 },
          };
        },
      )
      .mockImplementationOnce(
        async (
          _remote: BackupFile,
          mergeOptions: { beforeApply?: (candidate: BackupFile) => unknown },
        ) => {
          await mergeOptions.beforeApply?.(
            backup({ exportedAt: 13, courses: [{ id: 'two', name: 'Two' } as CourseRecord] }),
          );
          return {
            cards: { kept: 0, added: 0, removed: 0 },
            courses: { kept: 0, added: 1, removed: 0 },
            lessons: { kept: 0, added: 0, removed: 0 },
            reviewEvents: { kept: 0, added: 0, removed: 0 },
          };
        },
      );

    const result = await syncCycle(options(relay));

    expect(relay.pull).toHaveBeenCalledTimes(2);
    expect(relay.push).toHaveBeenCalledTimes(2);
    expect(relay.push.mock.calls[0]![2]).toBe('"generation-1"');
    expect(relay.push.mock.calls[1]![2]).toBe('"generation-2"');
    expect(result).toMatchObject({ attempts: 2, generation: '"generation-3"', pushed: true });
  });

  it('shares one in-flight promise between overlapping callers', async () => {
    let releasePull: ((value: null) => void) | undefined;
    const relay = provider({
      pull: vi.fn().mockImplementation(
        () =>
          new Promise<null>((resolve) => {
            releasePull = resolve;
          }),
      ),
    });

    const first = syncCycle(options(relay));
    const second = syncCycle(options(relay));
    expect(second).toBe(first);
    expect(relay.pull).toHaveBeenCalledTimes(1);

    releasePull?.(null);
    await expect(first).resolves.toMatchObject({ pushed: true });
  });

  it('rejects an overlapping caller that asks for a different channel', async () => {
    let releasePull: ((value: null) => void) | undefined;
    const relay = provider({
      pull: vi.fn().mockImplementation(
        () =>
          new Promise<null>((resolve) => {
            releasePull = resolve;
          }),
      ),
    });

    const first = syncCycle(options(relay));
    const second = syncCycle(options(relay, { channelId: 'ffffffffffffffffffffffffffffffff' }));
    await expect(second).rejects.toThrow('different channel');
    expect(relay.pull).toHaveBeenCalledTimes(1);

    releasePull?.(null);
    await expect(first).resolves.toMatchObject({ pushed: true });
  });

  it('rejects an oversized merged snapshot before applying or pushing it', async () => {
    const remoteSnapshot = backup({ exportedAt: 20 });
    const relay = provider({ pull: vi.fn().mockResolvedValue(await remoteBlob(remoteSnapshot)) });

    const sizeError = new SyncSnapshotTooLargeError({
      plaintextBytes: 1_234,
      transportBytes: 4_600_001,
      limitBytes: SYNC_PLATFORM_BODY_LIMIT_BYTES,
      courseNames: ['Organic Chemistry'],
    });
    manualMergeMock.mockRejectedValueOnce(
      new MockManualMergeError('This sync snapshot is too large.', {
        databaseModified: false,
        causeError: sizeError,
      }),
    );

    const result = syncCycle(options(relay));
    await expect(result).rejects.toBeInstanceOf(SyncSnapshotTooLargeError);
    await expect(result).rejects.toMatchObject({
      message: expect.stringContaining('Organic Chemistry'),
    });
    expect(relay.push).not.toHaveBeenCalled();
    expect(writeSyncStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastError: expect.stringContaining('Organic Chemistry') }),
    );
  });
});
