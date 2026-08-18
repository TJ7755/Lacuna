// P5 pull-merge-push cycle. The cycle owns ordering and safety; RelayProvider
// owns only opaque byte transport, while manualMerge remains the one database
// apply path for a peer merge.

import type { BackupFile } from '../db/types';
import { readSyncState, writeSyncState } from '../db/mutationStamp';
import { exportDatabase } from '../db/portability';
import { ManualMergeError, manualMerge, type ManualMergeSummary } from './manualMerge';
import { openState, sealState } from './crypto';
import {
  assertSnapshotSize,
  decodeSnapshot,
  encodeSnapshot,
  snapshotsEquivalent,
  type SnapshotSizeReport,
  SyncSnapshotTooLargeError,
} from './snapshot';
import {
  EMPTY_GENERATION,
  type RelayBlob,
  type RelayProvider,
  StaleGenerationError,
} from './relay';

/**
 * P5 authenticates state but has no authenticated monotonic clock. A valid old
 * ciphertext can therefore be replayed by a relay operator; merge protection
 * keeps newer local records, but this cycle does not claim rollback protection.
 */
export const SYNC_FRESHNESS_POLICY =
  'authenticated-local-merge-without-relay-rollback-protection' as const;

const DEFAULT_MAX_ATTEMPTS = 2;

export interface SyncCycleOptions {
  provider: RelayProvider;
  channelId: string;
  channelKey: Uint8Array;
  /** Injectable clock for deterministic state and test assertions. */
  now?: () => number;
  /** Defaults to one retry after a 412, as required by the relay contract. */
  maxAttempts?: number;
}

export interface SyncResult {
  attempts: number;
  pulled: boolean;
  pushed: boolean;
  /** Encrypted state size, including the AES-GCM envelope. */
  snapshotBytes: number;
  /** JSON size before encryption, useful when explaining a size failure. */
  snapshotPlaintextBytes: number;
  generation: string;
  mergeSummary: ManualMergeSummary | null;
  size: SnapshotSizeReport;
}

let inFlight: Promise<SyncResult> | null = null;

/** Run one device sync; overlapping callers share the same promise. */
export function syncCycle(options: SyncCycleOptions): Promise<SyncResult> {
  if (inFlight) return inFlight;

  const promise = executeSync(options)
    .catch(async (error: unknown) => {
      await recordFailure(options, error);
      throw error;
    })
    .finally(() => {
      if (inFlight === promise) inFlight = null;
    });
  inFlight = promise;
  return promise;
}

/** Named alias for callers that prefer the operation rather than the mechanism. */
export const runSyncCycle = syncCycle;

/** Reset the module-level single-flight guard between isolated tests. */
export function __resetSyncFlightForTests(): void {
  inFlight = null;
}

async function executeSync(options: SyncCycleOptions): Promise<SyncResult> {
  const maxAttempts = normaliseAttempts(options.maxAttempts);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await executeAttempt(options, attempt);
    } catch (error) {
      if (!(error instanceof StaleGenerationError) || attempt === maxAttempts) throw error;
    }
  }
  throw new Error('Sync ended without a result.');
}

async function executeAttempt(options: SyncCycleOptions, attempt: number): Promise<SyncResult> {
  const remote = await options.provider.pull('state');
  if (!remote) {
    const local = await exportDatabase();
    const sealed = await prepareSnapshot(local, options);
    const pushed = await options.provider.push('state', sealed.bytes, EMPTY_GENERATION);
    await recordSuccess(options, pushed.generation, sealed);
    return resultFor(attempt, false, true, sealed, pushed.generation, null);
  }

  const remoteSnapshot = await openRemoteSnapshot(remote, options);
  let mergedSnapshot: BackupFile | undefined;
  let sealed: PreparedSnapshot | undefined;
  let mergeSummary: ManualMergeSummary;

  try {
    mergeSummary = await manualMerge(remoteSnapshot, {
      beforeApply: async (candidate) => {
        mergedSnapshot = candidate;
        sealed = await prepareSnapshot(candidate, options);
      },
    });
  } catch (error) {
    throw unwrapManualMergeError(error);
  }

  if (!mergedSnapshot || !sealed) {
    throw new Error('The sync merge did not produce a snapshot.');
  }

  if (snapshotsEquivalent(mergedSnapshot, remoteSnapshot)) {
    await recordSuccess(options, remote.generation, sealed);
    return resultFor(attempt, true, false, sealed, remote.generation, mergeSummary);
  }

  const pushed = await options.provider.push('state', sealed.bytes, remote.generation);
  await recordSuccess(options, pushed.generation, sealed);
  return resultFor(attempt, true, true, sealed, pushed.generation, mergeSummary);
}

interface PreparedSnapshot {
  bytes: Uint8Array;
  size: SnapshotSizeReport;
}

async function prepareSnapshot(
  snapshot: BackupFile,
  options: SyncCycleOptions,
): Promise<PreparedSnapshot> {
  const plaintext = encodeSnapshot(snapshot);
  const bytes = await sealState(options.channelKey, plaintext, { channelId: options.channelId });
  const size = assertSnapshotSize(snapshot, bytes.byteLength);
  return { bytes, size };
}

async function openRemoteSnapshot(
  remote: RelayBlob,
  options: SyncCycleOptions,
): Promise<BackupFile> {
  const plaintext = await openState(options.channelKey, remote.bytes, {
    channelId: options.channelId,
  });
  return decodeSnapshot(plaintext);
}

function resultFor(
  attempts: number,
  pulled: boolean,
  pushed: boolean,
  prepared: PreparedSnapshot,
  generation: string,
  mergeSummary: ManualMergeSummary | null,
): SyncResult {
  return {
    attempts,
    pulled,
    pushed,
    snapshotBytes: prepared.bytes.byteLength,
    snapshotPlaintextBytes: prepared.size.plaintextBytes,
    generation,
    mergeSummary,
    size: prepared.size,
  };
}

function unwrapManualMergeError(error: unknown): unknown {
  if (error instanceof ManualMergeError && error.causeError instanceof SyncSnapshotTooLargeError) {
    return error.causeError;
  }
  return error;
}

async function recordSuccess(
  options: SyncCycleOptions,
  generation: string,
  prepared: PreparedSnapshot,
): Promise<void> {
  const previous = await readSyncState().catch(() => undefined);
  await writeSyncState({
    ...previous,
    channelId: options.channelId,
    lastPushedGeneration: generation,
    lastSuccessfulSyncAt: options.now?.() ?? Date.now(),
    lastSnapshotBytes: prepared.bytes.byteLength,
    lastSnapshotPlaintextBytes: prepared.size.plaintextBytes,
    lastError: null,
  });
}

async function recordFailure(options: SyncCycleOptions, error: unknown): Promise<void> {
  const previous = await readSyncState().catch(() => undefined);
  const size = error instanceof SyncSnapshotTooLargeError ? error.report : undefined;
  await writeSyncState({
    ...previous,
    channelId: options.channelId,
    ...(size
      ? {
          lastSnapshotBytes: size.transportBytes,
          lastSnapshotPlaintextBytes: size.plaintextBytes,
        }
      : {}),
    lastError: errorMessage(error),
  }).catch(() => undefined);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normaliseAttempts(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_ATTEMPTS;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('Sync attempts must be a positive integer.');
  }
  return value;
}
