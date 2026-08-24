// P5 pull-merge-push cycle. The cycle owns ordering and safety; RelayProvider
// owns only opaque byte transport, while manualMerge remains the one database
// apply path for a peer merge.

import type { BackupFile } from '../db/types';
import { updateSyncState } from '../db/mutationStamp';
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
let inFlightOptions: SyncCycleOptions | null = null;

/**
 * Run one device sync; overlapping callers share the same promise. A caller
 * that asks for a different channel while one is in flight is rejected rather
 * than handed another channel's result.
 */
export function syncCycle(options: SyncCycleOptions): Promise<SyncResult> {
  if (inFlight) {
    if (!inFlightOptions || !sameChannel(inFlightOptions, options)) {
      return Promise.reject(
        new Error('Another sync is already in progress on a different channel.'),
      );
    }
    return inFlight;
  }

  const promise = executeSync(options)
    .catch(async (error: unknown) => {
      await recordFailure(options, error);
      throw error;
    })
    .finally(() => {
      if (inFlight === promise) {
        inFlight = null;
        inFlightOptions = null;
      }
    });
  inFlight = promise;
  inFlightOptions = options;
  return promise;
}

/** Named alias for callers that prefer the operation rather than the mechanism. */
export const runSyncCycle = syncCycle;

/** Reset the module-level single-flight guard between isolated tests. */
export function __resetSyncFlightForTests(): void {
  inFlight = null;
  inFlightOptions = null;
}

function sameChannel(left: SyncCycleOptions, right: SyncCycleOptions): boolean {
  if (left.channelId !== right.channelId) return false;
  const leftKey = left.channelKey;
  const rightKey = right.channelKey;
  if (leftKey.length !== rightKey.length) return false;
  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] !== rightKey[index]) return false;
  }
  return true;
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
  let mergeSummary: ManualMergeSummary;

  try {
    mergeSummary = await manualMerge(remoteSnapshot, {
      beforeApply: async (candidate) => {
        mergedSnapshot = candidate;
        // Size-gate before the database is replaced. These sealed bytes are
        // for measurement only: importBackup normalises the candidate in
        // place after this hook returns, so the push payload is sealed again
        // below from the state that was actually applied.
        const plaintext = encodeSnapshot(candidate);
        const bytes = await sealState(options.channelKey, plaintext, {
          channelId: options.channelId,
        });
        assertSnapshotSize(candidate, bytes.byteLength, plaintext.byteLength);
      },
    });
  } catch (error) {
    throw unwrapManualMergeError(error);
  }

  if (!mergedSnapshot) {
    throw new Error('The sync merge did not produce a snapshot.');
  }

  const sealed = await prepareSnapshot(mergedSnapshot, options);

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
  const size = assertSnapshotSize(snapshot, bytes.byteLength, plaintext.byteLength);
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
  await updateSyncState((previous) => ({
    ...previous,
    channelId: options.channelId,
    lastPushedGeneration: generation,
    lastSuccessfulSyncAt: options.now?.() ?? Date.now(),
    lastSnapshotBytes: prepared.bytes.byteLength,
    lastSnapshotPlaintextBytes: prepared.size.plaintextBytes,
    lastError: null,
  }));
}

async function recordFailure(options: SyncCycleOptions, error: unknown): Promise<void> {
  const size = error instanceof SyncSnapshotTooLargeError ? error.report : undefined;
  await updateSyncState((previous) => ({
    ...previous,
    channelId: options.channelId,
    ...(size
      ? {
          lastSnapshotBytes: size.transportBytes,
          lastSnapshotPlaintextBytes: size.plaintextBytes,
        }
      : {}),
    lastError: errorMessage(error),
  })).catch(() => undefined);
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
