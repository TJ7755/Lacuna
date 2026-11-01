// P5 pull-merge-push cycle. The cycle owns ordering and safety; RelayProvider
// owns only opaque byte transport, while manualMerge remains the one database
// apply path for a peer merge.

import type { BackupFile, SyncState } from '../db/types';
import { readSyncState, updateSyncState } from '../db/mutationStamp';
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
import { replacementLifecycle } from '../db/replacementLifecycle';

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
  /** Expected HTTP relay capabilities, checked against the persisted pairing. */
  relayUrl?: string;
  writeToken?: string;
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
  /** Uncompressed JSON size, useful when explaining a size failure. */
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

  let owner: PairingOwner | undefined;
  const promise = readSyncState()
    .then((state) => {
      const startingOwner = capturePairingOwner(state);
      if (
        startingOwner.channelId !== options.channelId ||
        (options.relayUrl !== undefined && startingOwner.relayUrl !== options.relayUrl) ||
        (startingOwner.channelKeyHex !== undefined &&
          startingOwner.channelKeyHex !==
            Array.from(options.channelKey, (byte) => byte.toString(16).padStart(2, '0')).join(
              '',
            )) ||
        (options.writeToken !== undefined &&
          startingOwner.writeToken !== undefined &&
          startingOwner.writeToken !== options.writeToken)
      ) {
        throw pairingChanged();
      }
      owner = startingOwner;
      return executeSync(options, owner);
    })
    .catch(async (error: unknown) => {
      if (owner) await recordFailure(options, error, owner);
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

/** Reset the module-level single-flight guard between isolated tests. */
export function __resetSyncFlightForTests(): void {
  inFlight = null;
  inFlightOptions = null;
}

function sameChannel(left: SyncCycleOptions, right: SyncCycleOptions): boolean {
  if (
    left.channelId !== right.channelId ||
    left.relayUrl !== right.relayUrl ||
    left.writeToken !== right.writeToken
  )
    return false;
  const leftKey = left.channelKey;
  const rightKey = right.channelKey;
  if (leftKey.length !== rightKey.length) return false;
  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] !== rightKey[index]) return false;
  }
  return true;
}

async function executeSync(options: SyncCycleOptions, owner: PairingOwner): Promise<SyncResult> {
  const maxAttempts = normaliseAttempts(options.maxAttempts);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await executeAttempt(options, attempt, owner);
    } catch (error) {
      if (!(error instanceof StaleGenerationError) || attempt === maxAttempts) throw error;
    }
  }
  throw new Error('Sync ended without a result.');
}

async function executeAttempt(
  options: SyncCycleOptions,
  attempt: number,
  owner: PairingOwner,
): Promise<SyncResult> {
  const remote = await options.provider.pull('state');
  await assertCurrentPairing(owner);
  if (!remote) {
    const sealed = await replacementLifecycle.replace('peer', async () => {
      const local = await exportDatabase();
      return prepareSnapshot(local, options);
    });
    await assertCurrentPairing(owner);
    const pushed = await options.provider.push('state', sealed.bytes, EMPTY_GENERATION);
    await recordSuccess(options, pushed.generation, sealed, owner);
    return resultFor(attempt, false, true, sealed, pushed.generation, null);
  }

  const remoteSnapshot = await openRemoteSnapshot(remote, options);
  await assertCurrentPairing(owner);
  let mergedSnapshot: BackupFile | undefined;
  let mergeSummary: ManualMergeSummary;

  try {
    mergeSummary = await manualMerge(remoteSnapshot, {
      kind: 'peer',
      beforeApply: async (candidate) => {
        mergedSnapshot = candidate;
        // Size-gate before the database is replaced. These sealed bytes are
        // for measurement only: importBackup normalises the candidate in
        // place after this hook returns, so the push payload is sealed again
        // below from the state that was actually applied.
        const encoded = await encodeSnapshot(candidate);
        const bytes = await sealState(options.channelKey, encoded.payload, {
          channelId: options.channelId,
        });
        assertSnapshotSize(candidate, bytes.byteLength, encoded.jsonBytes);
        await assertCurrentPairing(owner);
      },
    });
  } catch (error) {
    throw unwrapManualMergeError(error);
  }

  if (!mergedSnapshot) {
    throw new Error('The sync merge did not produce a snapshot.');
  }

  const sealed = await prepareSnapshot(mergedSnapshot, options);
  await assertCurrentPairing(owner);

  if (snapshotsEquivalent(mergedSnapshot, remoteSnapshot)) {
    await recordSuccess(options, remote.generation, sealed, owner);
    return resultFor(attempt, true, false, sealed, remote.generation, mergeSummary);
  }

  const pushed = await options.provider.push('state', sealed.bytes, remote.generation);
  await recordSuccess(options, pushed.generation, sealed, owner);
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
  const encoded = await encodeSnapshot(snapshot);
  const bytes = await sealState(options.channelKey, encoded.payload, {
    channelId: options.channelId,
  });
  const size = assertSnapshotSize(snapshot, bytes.byteLength, encoded.jsonBytes);
  return { bytes, size };
}

async function openRemoteSnapshot(
  remote: RelayBlob,
  options: SyncCycleOptions,
): Promise<BackupFile> {
  const plaintext = await openState(options.channelKey, remote.bytes, {
    channelId: options.channelId,
  });
  return await decodeSnapshot(plaintext);
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

function capturePairingOwner(state: SyncState | undefined) {
  return {
    channelId: state?.channelId,
    relayUrl: state?.relayUrl,
    wrappedKeyMaterial: state?.wrappedKeyMaterial,
    channelKeyHex: state?.remembered?.channelKeyHex,
    writeToken: state?.remembered?.writeToken,
  };
}
type PairingOwner = ReturnType<typeof capturePairingOwner>;

function pairingMatches(state: SyncState | undefined, owner: PairingOwner): boolean {
  return (
    owner.channelId === state?.channelId &&
    owner.relayUrl === state?.relayUrl &&
    owner.wrappedKeyMaterial === state?.wrappedKeyMaterial &&
    owner.channelKeyHex === state?.remembered?.channelKeyHex &&
    owner.writeToken === state?.remembered?.writeToken
  );
}

function pairingChanged(): Error {
  return new Error('The sync pairing changed while this sync was in progress.');
}

async function assertCurrentPairing(owner: PairingOwner): Promise<void> {
  if (!pairingMatches(await readSyncState(), owner)) throw pairingChanged();
}

async function recordSuccess(
  options: SyncCycleOptions,
  generation: string,
  prepared: PreparedSnapshot,
  owner: PairingOwner,
): Promise<void> {
  let recorded = false;
  await updateSyncState((previous) => {
    // Compare inside the read-modify-write transaction, not before opening it.
    if (!pairingMatches(previous, owner)) return undefined;
    recorded = true;
    return {
      ...previous,
      channelId: options.channelId,
      lastPushedGeneration: generation,
      lastSuccessfulSyncAt: options.now?.() ?? Date.now(),
      lastSnapshotBytes: prepared.bytes.byteLength,
      lastSnapshotPlaintextBytes: prepared.size.plaintextBytes,
      lastError: null,
    };
  });
  if (!recorded) throw pairingChanged();
}

async function recordFailure(
  options: SyncCycleOptions,
  error: unknown,
  owner: PairingOwner,
): Promise<void> {
  const size = error instanceof SyncSnapshotTooLargeError ? error.report : undefined;
  await updateSyncState((previous) => {
    if (!pairingMatches(previous, owner)) return undefined;
    return {
      ...previous,
      channelId: options.channelId,
      ...(size
        ? {
            lastSnapshotBytes: size.transportBytes,
            lastSnapshotPlaintextBytes: size.plaintextBytes,
          }
        : {}),
      lastError: errorMessage(error),
    };
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
