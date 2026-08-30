import 'fake-indexeddb/auto';
import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { defaultFsrsParameters } from '../src/fsrs/params';
import { makeSessionContext, selectNext, sessionComplete } from '../src/fsrs/session';
import type { Card, SchedulingUnitRecord } from '../src/db/types';

class AuditStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', { value: new AuditStorage() });
}

const [{ createCourse, recordReview, sampleReviewTrajectory }, { db }] = await Promise.all([
  import('../src/db/repository'),
  import('../src/db/schema'),
]);

const NOW = Date.UTC(2026, 7, 12, 12);
const SESSION_CARD_COUNT = 10_000;
const RECORD_REVIEW_CARD_COUNTS = [500, 2_000, 10_000] as const;
const INITIAL_ASSET_BUDGET = {
  javascriptBytes: 900_000,
  javascriptGzipBytes: 280_000,
  cssBytes: 130_000,
  cssGzipBytes: 22_000,
} as const;

function benchmark(fn: () => unknown, repetitions: number): number {
  const samples: number[] = [];
  for (let i = 0; i < repetitions; i += 1) {
    const started = performance.now();
    fn();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

function makeBenchmarkDeck(): SchedulingUnitRecord {
  return {
    id: 'performance-deck',
    name: 'Performance benchmark',
    examDate: NOW + 30 * 24 * 60 * 60 * 1000,
    createdAt: NOW,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    kind: 'legacy-deck',
    courseId: null,
    lessonId: null,
    updatedAt: NOW,
  };
}

function makeBenchmarkCard(index: number, deckId: string): Card {
  return {
    id: `performance-card-${index}`,
    conceptId: `performance-concept-${index}`,
    deckId,
    schedulingUnitId: deckId,
    type: 'front_back',
    front: `Question ${index}`,
    back: 'Answer',
    stability: 10,
    difficulty: 5,
    lastReviewed: NOW - 2 * 24 * 60 * 60 * 1000,
    reps: 2,
    lapses: 0,
    state: 2,
    due: NOW,
    scheduledDays: 2,
    learningSteps: 0,
    history: [],
    createdAt: NOW - index,
    updatedAt: NOW - index,
    suspended: false,
    buriedUntil: null,
  };
}

async function measureSessionEngine() {
  const deck = makeBenchmarkDeck();
  const cards = Array.from({ length: SESSION_CARD_COUNT }, (_, index) =>
    makeBenchmarkCard(index, deck.id),
  );
  const context = makeSessionContext([deck]);
  const cooldowns = new Map<string, number>();

  selectNext(cards, context, cooldowns, NOW);
  sessionComplete(cards, context, NOW);

  return {
    cardCount: SESSION_CARD_COUNT,
    selectNextMsMedian: benchmark(
      () => selectNext(cards, context, cooldowns, NOW),
      5,
    ),
    sessionCompleteMsMedian: benchmark(
      () => sessionComplete(cards, context, NOW),
      5,
    ),
  };
}

async function resetBenchmarkDatabase(cardCount: number) {
  await db.delete();
  await db.open();
  const course = await createCourse('Performance benchmark', {
    examDate: NOW + 30 * 24 * 60 * 60 * 1000,
  });
  const deck = await db.schedulingUnits.get(course.id);
  if (!deck) throw new Error('Performance benchmark scheduling unit was not created.');
  const cards = Array.from({ length: cardCount }, (_, index) =>
    makeBenchmarkCard(index, deck.id),
  );
  await db.cards.bulkAdd(cards);
  return { deck, cards };
}

async function waitForDeferredSampling() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function addCurrentDaySample(deckId: string, eventId: string) {
  await db.sessionHistory.add({
    eventId,
    sessionId: 'performance-seed-session',
    timestamp: NOW,
    deckId,
    schedulingUnitId: deckId,
    averagePredictedRetrievability: 0.5,
  });
}

function reviewArgs(card: Card, deck: SchedulingUnitRecord, eventId: string) {
  return {
    card,
    deck,
    eventId,
    sessionId: `performance-session-${eventId}`,
    grade: 3 as const,
    responseTimeSec: 1,
    distracted: false,
    correct: true,
    sessionKind: 'deck' as const,
    now: NOW,
  };
}

async function measureCommonPath(cardCount: number) {
  const { deck, cards } = await resetBenchmarkDatabase(cardCount);
  await addCurrentDaySample(deck.id, `performance-seed-${cardCount}`);

  const started = performance.now();
  await recordReview(reviewArgs(cards[0], deck, `performance-event-${cardCount}`));

  return {
    cardCount,
    singleRecordReviewMs: performance.now() - started,
  };
}

async function measureOnceDailySampling() {
  const { deck, cards } = await resetBenchmarkDatabase(SESSION_CARD_COUNT);
  const eventId = 'performance-sampling-event';
  const seedEventId = 'performance-sampling-seed';
  await addCurrentDaySample(deck.id, seedEventId);
  await recordReview(reviewArgs(cards[0], deck, eventId));
  await waitForDeferredSampling();
  await db.sessionHistory.where('eventId').equals(seedEventId).delete();

  const started = performance.now();
  await sampleReviewTrajectory({
    eventId,
    sessionId: `performance-session-${eventId}`,
    timestamp: NOW,
    deck,
    kind: 'scheduling-unit',
    cardId: cards[0].id,
  });

  return {
    cardCount: SESSION_CARD_COUNT,
    sampleCallMs: performance.now() - started,
  };
}

async function measureRecordReview() {
  const commonPath: Array<{ cardCount: number; singleRecordReviewMs: number }> = [];
  for (const cardCount of RECORD_REVIEW_CARD_COUNTS) {
    commonPath.push(await measureCommonPath(cardCount));
    await waitForDeferredSampling();
  }

  const onceDailySampling = await measureOnceDailySampling();
  await waitForDeferredSampling();
  return { commonPath, onceDailySampling };
}

async function measureBuildOutput() {
  let index: string;
  try {
    index = await readFile('dist/index.html', 'utf8');
  } catch {
    return { available: false };
  }

  const references = [...index.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(
    (match) => match[1],
  );
  const assets = await Promise.all(
    [...new Set(references)].map(async (reference) => {
      const contents = await readFile(`dist${reference}`);
      return {
        name: reference.replace('/assets/', ''),
        bytes: contents.byteLength,
        gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
      };
    }),
  );
  const allAssetNames = await readdir('dist/assets').catch(() => [] as string[]);
  const allAssets = await Promise.all(
    allAssetNames.map(async (name) => {
      const contents = await readFile(`dist/assets/${name}`);
      return {
        name,
        bytes: contents.byteLength,
        gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
      };
    }),
  );
  const initialJavaScript = assets.filter((asset) => asset.name.endsWith('.js'));
  const initialCss = assets.filter((asset) => asset.name.endsWith('.css'));
  return {
    available: true,
    initialJavaScript: {
      assets: initialJavaScript,
      bytes: initialJavaScript.reduce((total, asset) => total + asset.bytes, 0),
      gzipBytes: initialJavaScript.reduce((total, asset) => total + asset.gzipBytes, 0),
    },
    initialCss: {
      assets: initialCss,
      bytes: initialCss.reduce((total, asset) => total + asset.bytes, 0),
      gzipBytes: initialCss.reduce((total, asset) => total + asset.gzipBytes, 0),
    },
    largestAssets: allAssets.sort((a, b) => b.bytes - a.bytes).slice(0, 12),
  };
}

type BuildOutput = Awaited<ReturnType<typeof measureBuildOutput>>;

function assertInitialAssetBudget(build: BuildOutput): void {
  if (!build.available) {
    throw new Error('Production assets are missing. Run `bun run build` before the audit.');
  }

  const failures: string[] = [];
  const checks = [
    ['JavaScript bytes', build.initialJavaScript.bytes, INITIAL_ASSET_BUDGET.javascriptBytes],
    [
      'JavaScript gzip bytes',
      build.initialJavaScript.gzipBytes,
      INITIAL_ASSET_BUDGET.javascriptGzipBytes,
    ],
    ['CSS bytes', build.initialCss.bytes, INITIAL_ASSET_BUDGET.cssBytes],
    ['CSS gzip bytes', build.initialCss.gzipBytes, INITIAL_ASSET_BUDGET.cssGzipBytes],
  ] as const;
  for (const [label, actual, maximum] of checks) {
    if (actual > maximum) failures.push(`${label}: ${actual} > ${maximum}`);
  }

  const optionalPreloads = [...build.initialJavaScript.assets, ...build.initialCss.assets]
    .map((asset) => asset.name)
    .filter((name) => /^(charts|markdown)-/.test(name));
  if (optionalPreloads.length > 0) {
    failures.push(`optional assets referenced on first load: ${optionalPreloads.join(', ')}`);
  }

  if (failures.length > 0) {
    throw new Error(`Initial asset budget failed:\n- ${failures.join('\n- ')}`);
  }
}

const assetsOnly = process.argv.includes('--assets-only');
const build = await measureBuildOutput();
assertInitialAssetBudget(build);
const [session, record] = assetsOnly
  ? [null, null]
  : await Promise.all([measureSessionEngine(), measureRecordReview()]);

console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      session,
      recordReview: record,
      build,
    },
    null,
    2,
  ),
);
