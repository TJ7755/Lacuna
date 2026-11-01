import { blobToArrayBuffer, sha256Blob, encodeBackupAssets } from './assetCodec';
export {
  encodeBackupAssets,
  backupAssetToMediaAsset,
  ASSET_PROTOCOL,
  toBlob,
  blobToArrayBuffer,
  sha256Blob,
  assetUrl,
} from './assetCodec';
import Dexie from 'dexie';
import { db } from './database';
import type { BackupAsset, MediaAsset } from '@lacuna/core/db/types';

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
]);
const ASSET_RE = /lacuna-asset:\/\/([a-f0-9]{64})/gi;

export function referencedAssetHashes(markdown: string): string[] {
  const hashes = new Set<string>();
  for (const match of markdown.matchAll(ASSET_RE)) hashes.add(match[1].toLowerCase());
  return [...hashes];
}

/** Find asset references in nested Question definitions and immutable receipts. */
export function referencedAssetHashesInValues(...values: readonly unknown[]): string[] {
  const hashes = new Set<string>();
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      referencedAssetHashes(value).forEach((hash) => hashes.add(hash));
      return;
    }
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    Object.values(value as Record<string, unknown>).forEach(visit);
  };
  values.forEach(visit);
  return [...hashes];
}

export function referencedAssetHashesInCards(cards: { front: string; back: string }[]): string[] {
  const hashes = new Set<string>();
  for (const card of cards) {
    referencedAssetHashes(`${card.front}\n${card.back}`).forEach((hash) => hashes.add(hash));
  }
  return [...hashes];
}

export function stripAssetMedia(markdown: string): { markdown: string; stripped: boolean } {
  let stripped = false;
  // Normalise line endings so every regex below can assume LF-only.
  const source = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Inline media: ![alt](lacuna-asset://hash). Audio uses the reserved "audio" alt text.
  let next = source.replace(/!\[([^\]]*)\]\(lacuna-asset:\/\/[a-f0-9]{64}\)/gi, (_m, alt) => {
    stripped = true;
    const kind = alt.toLowerCase() === 'audio' ? 'Audio' : 'Image';
    return `[${kind} omitted from share code${alt ? `: ${alt}` : ''}]`;
  });
  // Reference-style images: ![alt][ref] where [ref]: lacuna-asset://hash
  const strippedRefs = new Set<string>();
  next = next.replace(/!\[([^\]]*)\]\[([^\]]*)\]/gi, (m, alt, ref) => {
    const refPattern = new RegExp(
      `\\[${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:\\s*lacuna-asset:\\/\\/[a-f0-9]{64}`,
      'i',
    );
    if (refPattern.test(next)) {
      stripped = true;
      strippedRefs.add(ref);
      return `[Image omitted from share code: ${alt || 'image'}]`;
    }
    return m;
  });
  // Strip the dangling reference definitions so asset hashes don't leak.
  for (const ref of strippedRefs) {
    const defPattern = new RegExp(
      `\\n\\[${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:\\s*lacuna-asset:\\/\\/[a-f0-9]{64}\\s*(?=\\n|$)`,
      'gi',
    );
    next = next.replace(defPattern, '\n');
  }
  // HTML img tags: <img src="lacuna-asset://hash" ...>
  next = next.replace(/<img\s+[^>]*src=["']lacuna-asset:\/\/[a-f0-9]{64}["'][^>]*>/gi, (_m) => {
    stripped = true;
    return '[Image omitted from share code]';
  });
  return { markdown: next, stripped };
}

export async function storeImageBlob(
  blob: Blob,
  mimeType: string,
  width: number,
  height: number,
): Promise<MediaAsset> {
  const asset = await prepareImageAsset(blob, mimeType, width, height);
  await db.assets.put(asset);
  return asset;
}

/** Prepare an image row without persisting it, for caller-owned atomic transactions. */
export async function prepareImageAsset(
  blob: Blob,
  mimeType: string,
  width: number,
  height: number,
): Promise<MediaAsset> {
  const hash = await sha256Blob(blob);
  return {
    hash,
    blob: new Uint8Array(await blobToArrayBuffer(blob)),
    mimeType,
    kind: 'image',
    width,
    height,
    createdAt: Date.now(),
  };
}

export async function storeAudioBlob(blob: Blob, mimeType = blob.type): Promise<MediaAsset> {
  const normalisedMimeType = mimeType.toLowerCase().split(';', 1)[0];
  if (!SUPPORTED_AUDIO_MIME_TYPES.has(normalisedMimeType)) {
    throw new Error('Use an MP3, M4A, MP4, Ogg, WAV or WebM audio file.');
  }
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new Error('Audio files must be 25 MB or smaller.');
  }
  if (blob.size === 0) throw new Error('The selected audio file is empty.');

  const hash = await sha256Blob(blob);
  const asset: MediaAsset = {
    hash,
    blob: new Uint8Array(await blobToArrayBuffer(blob)),
    mimeType: normalisedMimeType,
    kind: 'audio',
    createdAt: Date.now(),
  };
  await db.assets.put(asset);
  return asset;
}

export async function extractMarkdownAssets(
  markdown: string,
  putAsset: (asset: MediaAsset) => Promise<unknown>,
  knownHashes?: Set<string>,
): Promise<string> {
  const { extractMarkdownAssets } = await Dexie.waitFor(import('./markdownAssets'));
  return extractMarkdownAssets(markdown, putAsset, knownHashes);
}

export async function assetsForBackup(hashes: string[]): Promise<BackupAsset[]> {
  if (hashes.length === 0) return [];
  const assets = await db.assets.where('hash').anyOf(hashes).toArray();
  return encodeBackupAssets(assets);
}

// ---------------------------------------------------------------------------
// Asset garbage collection
// ---------------------------------------------------------------------------

let gcTimeout: ReturnType<typeof setTimeout> | null = null;
let gcRunning = false;
let gcPauseCount = 0;
let gcPending = false;
let gcDelayMs = 3000;

/**
 * How long a stored asset is exempt from collection. Editors store an upload before the
 * card, note or question that references it is saved, so a sweep scheduled by anything
 * else in that window would otherwise delete the media out from under the author.
 */
export const ASSET_GC_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Scan every card's Markdown and remove assets whose hash is not referenced anywhere.
 * Safe to call at any time: it only deletes unreferenced rows older than the grace period.
 */
export async function collectOrphanedAssets(now: number = Date.now()): Promise<number> {
  if (gcRunning) return 0;
  gcRunning = true;
  try {
    return await db.transaction(
      'rw',
      [
        db.cards,
        db.notes,
        db.occlusions,
        db.questions,
        db.questionAttempts,
        db.questionSets,
        db.questionSetAttempts,
        db.appState,
        db.assets,
      ],
      async () => {
        if ((await db.assets.count()) === 0) return 0;
        // Build the set of referenced hashes by streaming every persisted Markdown
        // owner in batches so note-only images are not mistaken for orphans.
        const referenced = new Set<string>();
        const batchSize = 500;
        let cardOffset = 0;
        for (;;) {
          const batch = await db.cards.offset(cardOffset).limit(batchSize).toArray();
          if (batch.length === 0) break;
          for (const card of batch) {
            referencedAssetHashes(`${card.front}\n${card.back}`).forEach((h) => referenced.add(h));
          }
          cardOffset += batch.length;
        }
        let noteOffset = 0;
        for (;;) {
          const batch = await db.notes.offset(noteOffset).limit(batchSize).toArray();
          if (batch.length === 0) break;
          for (const note of batch) {
            referencedAssetHashes(note.content).forEach((h) => referenced.add(h));
          }
          noteOffset += batch.length;
        }
        // An occlusion's diagram is referenced solely by `Occlusion.assetHash`, not by any
        // Markdown the regex above scans (its generated cards carry only a plain-text
        // fallback, per occlusionGeneration.ts) — without this, GC would delete a diagram out
        // from under the cards generated from it.
        let occlusionOffset = 0;
        for (;;) {
          const batch = await db.occlusions.offset(occlusionOffset).limit(batchSize).toArray();
          if (batch.length === 0) break;
          for (const occlusion of batch) {
            referenced.add(occlusion.assetHash);
          }
          occlusionOffset += batch.length;
        }
        let questionOffset = 0;
        for (;;) {
          const batch = await db.questions.offset(questionOffset).limit(batchSize).toArray();
          if (batch.length === 0) break;
          referencedAssetHashesInValues(batch).forEach((hash) => referenced.add(hash));
          questionOffset += batch.length;
        }
        // Attempts deliberately outlive deleted Questions, so their rendered receipts
        // remain asset owners even when no definition references the media any more.
        let attemptOffset = 0;
        for (;;) {
          const batch = await db.questionAttempts.offset(attemptOffset).limit(batchSize).toArray();
          if (batch.length === 0) break;
          referencedAssetHashesInValues(batch).forEach((hash) => referenced.add(hash));
          attemptOffset += batch.length;
        }
        let questionSetOffset = 0;
        for (;;) {
          const batch = await db.questionSets.offset(questionSetOffset).limit(batchSize).toArray();
          if (batch.length === 0) break;
          referencedAssetHashesInValues(batch).forEach((hash) => referenced.add(hash));
          questionSetOffset += batch.length;
        }
        let questionSetAttemptOffset = 0;
        for (;;) {
          const batch = await db.questionSetAttempts
            .offset(questionSetAttemptOffset)
            .limit(batchSize)
            .toArray();
          if (batch.length === 0) break;
          referencedAssetHashesInValues(batch).forEach((hash) => referenced.add(hash));
          questionSetAttemptOffset += batch.length;
        }
        // Author drafts are deliberately local-only app state, but their media must remain
        // reachable until the author either publishes or discards the draft.
        const draftEntries = await db.appState
          .where('key')
          .startsWith('questionSetDraft:')
          .toArray();
        referencedAssetHashesInValues(draftEntries.map((entry) => entry.value)).forEach((hash) =>
          referenced.add(hash),
        );

        // Rows without createdAt fall outside the index and so remain collectable.
        const recent = new Set(
          await db.assets
            .where('createdAt')
            .above(now - ASSET_GC_GRACE_MS)
            .primaryKeys(),
        );
        // Stream asset keys and collect orphans without loading all keys at once.
        const orphans: string[] = [];
        await db.assets.toCollection().eachPrimaryKey((hash) => {
          if (!referenced.has(hash) && !recent.has(hash)) orphans.push(hash);
        });
        if (orphans.length > 0) {
          await db.assets.bulkDelete(orphans);
        }
        return orphans.length;
      },
    );
  } finally {
    gcRunning = false;
  }
}

/**
 * Schedule a deferred asset sweep. Multiple rapid calls collapse into one so the
 * sweep runs only after a quiet period (e.g. after a bulk edit or import finishes).
 * Never runs during an active Learn session.
 */
export function scheduleAssetGc(delayMs = 3000): void {
  gcPending = true;
  gcDelayMs = delayMs;
  if (gcTimeout !== null) clearTimeout(gcTimeout);
  gcTimeout = null;
  if (gcPauseCount > 0) return;
  gcTimeout = setTimeout(() => {
    gcTimeout = null;
    gcPending = false;
    void collectOrphanedAssets();
  }, delayMs);
}

/** Defer scheduled sweeps until every active study session has left. */
export function pauseAssetGc(): () => void {
  gcPauseCount += 1;
  if (gcTimeout !== null) {
    clearTimeout(gcTimeout);
    gcTimeout = null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    gcPauseCount -= 1;
    if (gcPauseCount === 0 && gcPending) scheduleAssetGc(gcDelayMs);
  };
}
