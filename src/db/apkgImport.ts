// APKG worker orchestration and persistence. ZIP/SQLite parsing stays in apkgParser.
import type { Card } from './types';
import { db } from './schema';
import { projectCardsForStorage, reviewHistoryEntriesForCard } from './reviewHistory';
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
    const worker = new Worker(new URL('../workers/apkg.worker.ts', import.meta.url), {
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

interface ImportedMediaRef {
  hash: string;
  kind: 'image' | 'audio';
}

function replaceMediaRefs(text: string, mediaMap: Map<string, ImportedMediaRef>): string {
  let result = text;
  // Anki's native audio marker.
  result = result.replace(/\[sound:([^\]]+)\]/gi, (match, filename) => {
    const media = mediaMap.get(filename);
    if (!media || media.kind !== 'audio') return match;
    return `![audio](lacuna-asset://${media.hash})`;
  });
  // HTML img tags: <img src="filename.jpg">
  const imgRe = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  result = result.replace(imgRe, (match, src) => {
    const media = mediaMap.get(src);
    if (!media || media.kind !== 'image') return match;
    return `![image](lacuna-asset://${media.hash})`;
  });
  // Markdown image syntax: ![alt](filename.jpg)
  const mdImgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  result = result.replace(mdImgRe, (match, alt, src) => {
    const media = mediaMap.get(src);
    if (!media || media.kind !== 'image') return match;
    return `![${alt}](lacuna-asset://${media.hash})`;
  });
  // Plain text references like filename.jpg (fallback for filenames embedded in text)
  for (const [filename, media] of mediaMap.entries()) {
    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const plainRe = new RegExp(escaped, 'g');
    result = result.replace(
      plainRe,
      media.kind === 'audio'
        ? `![audio](lacuna-asset://${media.hash})`
        : `lacuna-asset://${media.hash}`,
    );
  }
  return result;
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
  targetSchedulingUnitId?: string,
): Promise<{ courseId: string; cards: Card[] }> {
  const { createCourse, createCards } = await import('./repository');
  const { storeAudioBlob, storeImageBlob } = await import('./assets');

  let targetUnit = targetSchedulingUnitId
    ? await db.schedulingUnits.get(targetSchedulingUnitId)
    : undefined;
  if (targetSchedulingUnitId && (!targetUnit || !targetUnit.courseId)) {
    throw new Error('Target scheduling unit not found.');
  }

  // Ingest supported media before creating any deck or card records. Asset writes are
  // content-addressed and harmless to retry; partially created imports are not.
  const mediaEntries = await Promise.all(
    [...result.media.entries()].map(async ([filename, bytes]) => {
      const mime = guessMimeType(filename);
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      if (mime.startsWith('image/')) {
        const dims = await getImageDimensions(blob);
        const asset = await storeImageBlob(blob, mime, dims?.width ?? 0, dims?.height ?? 0);
        return [filename, { hash: asset.hash, kind: 'image' as const }] as const;
      }
      if (mime.startsWith('audio/')) {
        const asset = await storeAudioBlob(blob, mime);
        return [filename, { hash: asset.hash, kind: 'audio' as const }] as const;
      }
      return null;
    }),
  );
  const mediaHashMap = new Map<string, ImportedMediaRef>();
  for (const entry of mediaEntries) {
    if (entry) mediaHashMap.set(entry[0], entry[1]);
  }

  let scheduledCards: Card[] = [];

  // Create the Course, cards, and both scheduling-history projections atomically.
  // This prevents a failed canonical-history write from leaving a partial import.
  let courseId = targetUnit?.courseId;
  await db.transaction(
    'rw',
    [
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
      if (!targetUnit) {
        const course = await createCourse(result.deckName);
        courseId = course.id;
        targetUnit = await db.schedulingUnits.get(course.id);
      }
      if (!courseId || !targetUnit) throw new Error('The import Course could not be created.');

      const cards = result.cards.map((card) => ({ ...card, deckId: targetUnit!.id }));
      const created = await createCards(
        targetUnit.id,
        cards.map((c) => ({
          type: c.type,
          front: c.front,
          back: c.back,
          tags: c.tags,
        })),
        { courseId, primaryLessonId: targetUnit.lessonId },
      );

      scheduledCards = created.map((card, i) => {
        const draft = cards[i];
        return {
          ...card,
          stability: draft.stability,
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

  // Replace media references in card text with Lacuna asset references.
  if (mediaHashMap.size > 0) {
    const rewritten: Card[] = [];
    for (const card of scheduledCards) {
      const newFront = replaceMediaRefs(card.front, mediaHashMap);
      const newBack = replaceMediaRefs(card.back, mediaHashMap);
      if (newFront !== card.front || newBack !== card.back) {
        card.front = newFront;
        card.back = newBack;
        rewritten.push(card);
      }
    }
    if (rewritten.length > 0) await db.cards.bulkPut(projectCardsForStorage(rewritten));
  }

  return { courseId: courseId!, cards: scheduledCards };
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    webm: 'audio/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}
