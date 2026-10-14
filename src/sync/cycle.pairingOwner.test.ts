import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile, SyncState } from '../db/types';
import type * as DbPortability from '../db/portability';
import { __resetSyncFlightForTests, syncCycle, type SyncCycleOptions } from './cycle';
import { sealState } from './crypto';
import { encodeSnapshot } from './snapshot';
import type { RelayProvider } from './relay';

const {
  exportDatabaseMock,
  readSyncStateMock,
  updateSyncStateMock,
  writeSyncStateMock,
  manualMergeMock,
} = vi.hoisted(() => ({
  exportDatabaseMock: vi.fn(),
  readSyncStateMock: vi.fn(),
  updateSyncStateMock: vi.fn(),
  writeSyncStateMock: vi.fn(),
  manualMergeMock: vi.fn(),
}));
vi.mock('../db/portability', async (importOriginal) => ({
  ...(await importOriginal<typeof DbPortability>()),
  exportDatabase: exportDatabaseMock,
}));
vi.mock('../db/mutationStamp', () => ({
  readSyncState: readSyncStateMock,
  updateSyncState: updateSyncStateMock,
}));
vi.mock('../db/replacementLifecycle', () => ({
  replacementLifecycle: {
    replace: (_kind: string, operation: () => Promise<unknown>) => operation(),
  },
}));
vi.mock('./manualMerge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./manualMerge')>()),
  manualMerge: manualMergeMock,
}));

const CHANNEL_ID = '0123456789abcdef0123456789abcdef';
const CHANNEL_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const NOW = 1_700_000_000_000;
function backup(): BackupFile {
  return {
    app: 'lacuna',
    version: 10,
    exportedAt: 1,
    cards: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
  };
}
function provider(overrides: Partial<RelayProvider> = {}) {
  return {
    pull: vi.fn().mockResolvedValue(null),
    push: vi.fn().mockResolvedValue({ generation: '"generation-2"' }),
    purge: vi.fn(),
    ...overrides,
  };
}
function options(relay: RelayProvider): SyncCycleOptions {
  return { provider: relay, channelId: CHANNEL_ID, channelKey: CHANNEL_KEY, now: () => NOW };
}
async function remoteBlob(snapshot: BackupFile) {
  return {
    bytes: await sealState(CHANNEL_KEY, encodeSnapshot(snapshot), { channelId: CHANNEL_ID }),
    generation: '"generation-1"',
  };
}
beforeEach(() => {
  __resetSyncFlightForTests();
  exportDatabaseMock.mockReset().mockResolvedValue(backup());
  readSyncStateMock.mockReset();
  writeSyncStateMock.mockReset();
  manualMergeMock.mockReset();
  updateSyncStateMock.mockReset().mockImplementation(async (update) => {
    const next = update(await readSyncStateMock());
    if (next !== undefined) await writeSyncStateMock(next);
  });
});

describe('stale pairing status', () => {
  it.each(['success', 'failure'] as const)(
    'keeps an unpaired device unpaired after a pending sync %s',
    async (outcome) => {
      let current: SyncState | undefined = {
        channelId: CHANNEL_ID,
        relayUrl: 'https://relay.example',
        wrappedKeyMaterial: 'initial-keybag',
      };
      readSyncStateMock.mockImplementation(async () => current);
      let finishPull!: (value: null) => void;
      let failPull!: (error: Error) => void;
      let signalStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      const relay = provider({
        pull: vi.fn(() => {
          signalStarted();
          return new Promise<null>((resolve, reject) => {
            finishPull = resolve;
            failPull = reject;
          });
        }),
      });
      const pending = syncCycle(options(relay));
      const finished =
        outcome === 'success'
          ? expect(pending).rejects.toThrow('sync pairing changed')
          : expect(pending).rejects.toThrow('relay unavailable');
      await started;
      current = undefined;
      if (outcome === 'success') finishPull(null);
      else failPull(new Error('relay unavailable'));
      await finished;

      expect(writeSyncStateMock).not.toHaveBeenCalled();
      expect(current).toBeUndefined();
    },
  );

  it.each([
    ['success', 'new-channel'],
    ['failure', 'new-channel'],
    ['success', CHANNEL_ID],
    ['failure', CHANNEL_ID],
  ] as const)(
    'preserves a newer pairing after pending sync %s on channel %s',
    async (outcome, nextChannelId) => {
      let current: SyncState = {
        channelId: CHANNEL_ID,
        relayUrl: 'https://relay.example',
        wrappedKeyMaterial: 'initial-keybag',
      };
      readSyncStateMock.mockImplementation(async () => current);
      let finishPull!: (value: null) => void;
      let failPull!: (error: Error) => void;
      let signalStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      const relay = provider({
        pull: vi.fn(() => {
          signalStarted();
          return new Promise<null>((resolve, reject) => {
            finishPull = resolve;
            failPull = reject;
          });
        }),
      });
      const pending = syncCycle(options(relay));
      const finished =
        outcome === 'success'
          ? expect(pending).rejects.toThrow('sync pairing changed')
          : expect(pending).rejects.toThrow('relay unavailable');
      await started;
      current = {
        channelId: nextChannelId,
        relayUrl: 'https://new-relay.example',
        wrappedKeyMaterial: 'new-keybag',
        lastPushedGeneration: 'new-generation',
        lastSuccessfulSyncAt: NOW + 1,
      };
      if (outcome === 'success') finishPull(null);
      else failPull(new Error('relay unavailable'));
      await finished;

      expect(writeSyncStateMock).not.toHaveBeenCalled();
      expect(current.channelId).toBe(nextChannelId);
      expect(current.lastPushedGeneration).toBe('new-generation');
    },
  );
  it('does not apply a delayed remote snapshot after a newer pairing replaces its owner', async () => {
    let current: SyncState = {
      channelId: CHANNEL_ID,
      relayUrl: 'https://relay.example',
      wrappedKeyMaterial: 'initial-keybag',
    };
    readSyncStateMock.mockImplementation(async () => current);
    const remote = await remoteBlob(backup());
    let finishPull!: (value: typeof remote) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const relay = provider({
      pull: vi.fn(() => {
        signalStarted();
        return new Promise<typeof remote>((resolve) => {
          finishPull = resolve;
        });
      }),
    });
    const pending = syncCycle(options(relay));
    const cancelled = expect(pending).rejects.toThrow('sync pairing changed');
    await started;
    current = {
      channelId: 'new-channel',
      relayUrl: 'https://new-relay.example',
      wrappedKeyMaterial: 'new-keybag',
    };
    finishPull(remote);
    await cancelled;

    expect(manualMergeMock).not.toHaveBeenCalled();
    expect(relay.push).not.toHaveBeenCalled();
    expect(writeSyncStateMock).not.toHaveBeenCalled();
  });

  it('checks pairing ownership again before a merged snapshot is applied', async () => {
    let current: SyncState | undefined = {
      channelId: CHANNEL_ID,
      relayUrl: 'https://relay.example',
      wrappedKeyMaterial: 'initial-keybag',
    };
    readSyncStateMock.mockImplementation(async () => current);
    const relay = provider({ pull: vi.fn().mockResolvedValue(await remoteBlob(backup())) });
    manualMergeMock.mockImplementation(
      async (
        _remote: BackupFile,
        mergeOptions: { beforeApply: (candidate: BackupFile) => Promise<void> },
      ) => {
        current = undefined;
        await mergeOptions.beforeApply(backup());
        return { cards: { kept: 0, added: 0, removed: 0 } };
      },
    );

    await expect(syncCycle(options(relay))).rejects.toThrow('sync pairing changed');

    expect(relay.push).not.toHaveBeenCalled();
    expect(writeSyncStateMock).not.toHaveBeenCalled();
  });
  it('does not recreate pairing metadata when an already pending push finishes after unpairing', async () => {
    let current: SyncState | undefined = {
      channelId: CHANNEL_ID,
      relayUrl: 'https://relay.example',
      wrappedKeyMaterial: 'initial-keybag',
    };
    readSyncStateMock.mockImplementation(async () => current);
    let finishPush!: (value: { generation: string }) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const relay = provider({
      push: vi.fn(() => {
        signalStarted();
        return new Promise<{ generation: string }>((resolve) => {
          finishPush = resolve;
        });
      }),
    });
    const pending = syncCycle(options(relay));
    const cancelled = expect(pending).rejects.toThrow('sync pairing changed');
    await started;
    current = undefined;
    finishPush({ generation: 'old-generation' });
    await cancelled;

    expect(writeSyncStateMock).not.toHaveBeenCalled();
    expect(current).toBeUndefined();
  });
  it('refuses an old channel before transport starts when a newer pairing is already stored', async () => {
    const current: SyncState = {
      channelId: 'new-channel',
      relayUrl: 'https://new-relay.example',
      wrappedKeyMaterial: 'new-keybag',
    };
    readSyncStateMock.mockResolvedValue(current);
    const relay = provider();

    await expect(syncCycle(options(relay))).rejects.toThrow('sync pairing changed');

    expect(relay.pull).not.toHaveBeenCalled();
    expect(relay.push).not.toHaveBeenCalled();
    expect(writeSyncStateMock).not.toHaveBeenCalled();
  });
});
