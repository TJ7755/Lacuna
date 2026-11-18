// APKG worker orchestration and persistence. ZIP/SQLite parsing stays in apkgParser.
import type { Card, MediaAsset } from '@lacuna/core/db/types';
import { guessMimeType, replaceMediaRefs, type ImportedMediaRef } from './apkgMedia';
import { db } from './schema';
import { prepareCards } from './cardRepository';
import { requireEditableImportUnit } from './cardImportDestination';
import { projectCardsForStorage, reviewHistoryEntriesForCard } from '@lacuna/core/db/reviewHistory';
import { assertApkgSize, type ApkgImportResult, type ApkgParseOptions } from './apkgTypes';
import sqlWasmUrl from '../assets/sql-wasm.wasm?url';

export type { ApkgCardDraft, ApkgImportResult, ApkgParseOptions } from './apkgTypes';

/**
 * Parse an Anki .apkg file into a Lacuna import payload.
 *
 * @param file - The .apkg file from a file input.
 * @param options - Import options.
 * @returns The parsed result, or throws a user-friendly error.
 */
export async function parseApkg(
  file: File,
  options: ApkgParseOptions = {},
): Promise<ApkgImportResult> {
  assertApkgSize(file.size);
  const buffer = await file.arrayBuffer();
  assertApkgSize(buffer.byteLength);
  const wasmUrl =
    typeof location === 'undefined' ? sqlWasmUrl : new URL(sqlWasmUrl, location.href).href;
  if (typeof Worker === 'undefined') {
    const { parseApkgBuffer } = await import('./apkgParser');
    return parseApkgBuffer(buffer, options, wasmUrl);
  }

  return new Promise<ApkgImportResult>((resolve, reject) => {
    // A new entry name bypasses cached worker responses whose CSP blocked WebAssembly.
    const worker = new Worker(new URL('../workers/apkgImport.worker.ts', import.meta.url), {
      type: 'module',
    });
    const cleanup = () => worker.terminate();
    worker.onmessage = (
      event: MessageEvent<
        { type: 'done'; result: ApkgImportResult } | { type: 'error'; message: string }
      >,
    ) => {
      cleanup();
      if (event.data.type === 'done') resolve(event.data.result);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Could not parse that Anki package.'));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error('The Anki import worker returned an unreadable response.'));
    };
    worker.postMessage({ buffer, options, wasmUrl }, [buffer]);
  });
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

function getImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(null);
    };
    img.src = URL.createObjectURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Create a Lacuna Course from an APKG result and insert everything into its bank.
 * This is a high-level helper that wires the engine output to the repository layer.
 */
export async function importApkgResult(
  result: ApkgImportResult,
  targetSchedulingUnitId?: string | (() => Promise<string>),
): Promise<{ courseId: string; cards: Card[] }> {
  const { createCourse } = await import('./repository');

  // Images are decoded and audio is hashed outside the write transaction: Dexie
  // commits the surrounding transaction when it sees an out-of-transaction
  // await (such as SHA-256 or canvas decode), so every async byte read happens
  // here. Only synchronous `put` calls run inside the atomic write below.
  const { prepareAudioAsset, prepareImageAsset } = await import('./assets');
  const preparedMedia = await Promise.all(
    [...result.media.entries()].map(async ([filename, bytes]) => {
      const mime = guessMimeType(filename);
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      if (mime.startsWith('image/')) {
        const dims = await getImageDimensions(blob);
        const asset = await prepareImageAsset(blob, mime, dims?.width ?? 0, dims?.height ?? 0);
        return [filename, { asset, kind: 'image' as const }] as const;
      }
      if (mime.startsWith('audio/')) {
        const asset = await prepareAudioAsset(blob, mime);
        return [filename, { asset, kind: 'audio' as const }] as const;
      }
      return null;
    }),
  );
  const mediaRefs = new Map<string, { asset: MediaAsset; kind: 'image' | 'audio' }>();
  for (const entry of preparedMedia) {
    if (entry) mediaRefs.set(entry[0], entry[1]);
  }

  let scheduledCards: Card[] = [];

  // Create the Course, assets, cards, and both scheduling-history projections
  // atomically. All media bytes are already prepared above, so the transaction
  // body performs only synchronous puts: a later card-write failure rolls the
  // course, assets, and cards back together.
  let courseId: string | null | undefined;
  const mediaHashMap = new Map<string, ImportedMediaRef>();
  for (const [filename, staged] of mediaRefs) {
    mediaHashMap.set(filename, {
      url: `lacuna-asset://${staged.asset.hash}`,
      kind: staged.kind,
    });
  }
  const commitCards = await prepareCards(
    result.cards.map((card) => ({
      type: card.type,
      front: replaceMediaRefs(card.front, mediaHashMap),
      back: replaceMediaRefs(card.back, mediaHashMap),
      tags: card.tags,
    })),
  );
  await db.transaction(
    'rw',
    [
      db.assets,
      db.courses,
      db.lessons,
      db.courseAssessments,
      db.cards,
      db.concepts,
      db.reviewHistory,
      db.schedulingUnits,
      db.coursePerformance,
      db.schedulingPerformance,
    ],
    async () => {
      if (mediaRefs.size > 0) {
        await db.assets.bulkPut([...mediaRefs.values()].map((staged) => staged.asset));
      }
      const targetId =
        typeof targetSchedulingUnitId === 'function'
          ? await targetSchedulingUnitId()
          : targetSchedulingUnitId;
      let targetUnit;
      if (targetId !== undefined) {
        targetUnit = await requireEditableImportUnit(targetId);
      } else {
        const course = await createCourse(result.deckName);
        targetUnit = await db.schedulingUnits.get(course.id);
      }
      courseId = targetUnit?.courseId;
      if (!courseId || !targetUnit) throw new Error('The import Course could not be created.');
      const cards = result.cards;
      const created = await commitCards(targetUnit.id, {
        courseId,
        primaryLessonId: targetUnit.lessonId,
      });

      scheduledCards = created.map((card, i) => {
        const draft = cards[i];
        return {
          ...card,
          stability: draft.stability,
          stabilityFast: null,
          difficulty: draft.difficulty,
          lastReviewed: draft.lastReviewed,
          reps: draft.reps,
          lapses: draft.lapses,
          state: draft.state,
          due: draft.due,
          scheduledDays: draft.scheduledDays,
          learningSteps: draft.learningSteps,
          history: draft.history,
          createdAt: draft.createdAt,
          suspended: draft.suspended,
        };
      });
      if (scheduledCards.length > 0) {
        const history = scheduledCards.flatMap((card) => reviewHistoryEntriesForCard(card));
        await db.cards.bulkPut(projectCardsForStorage(scheduledCards));
        if (history.length > 0) await db.reviewHistory.bulkPut(history);
      }
    },
  );

  return { courseId: courseId!, cards: scheduledCards };
}
