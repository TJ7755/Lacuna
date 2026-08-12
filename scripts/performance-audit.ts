import 'fake-indexeddb/auto';
import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { defaultFsrsParameters } from '../src/fsrs/params';
import { makeSessionContext, selectNext, sessionComplete } from '../src/fsrs/session';
import type { Card, Deck } from '../src/db/types';

const [{ createDeck, recordReview }, { db }] = await Promise.all([
  import('../src/db/repository'),
  import('../src/db/schema'),
]);

const NOW = Date.UTC(2026, 7, 12, 12);
const CARD_COUNT = 10_000;

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

function makeBenchmarkDeck(): Deck {
  return {
    id: 'performance-deck',
    name: 'Performance benchmark',
    examDate: NOW + 30 * 24 * 60 * 60 * 1000,
    createdAt: NOW,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
  };
}

function makeBenchmarkCard(index: number, deckId: string): Card {
  return {
    id: `performance-card-${index}`,
    deckId,
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
    suspended: false,
    buriedUntil: null,
  };
}

async function measureSessionEngine() {
  const deck = makeBenchmarkDeck();
  const cards = Array.from({ length: CARD_COUNT }, (_, index) =>
    makeBenchmarkCard(index, deck.id),
  );
  const context = makeSessionContext([deck]);
  const cooldowns = new Map<string, number>();

  selectNext(cards, context, cooldowns, NOW);
  sessionComplete(cards, context, NOW);

  return {
    cardCount: CARD_COUNT,
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

async function measureRecordReview() {
  await db.delete();
  await db.open();
  const deck = await createDeck('Performance benchmark');
  const cards = Array.from({ length: CARD_COUNT }, (_, index) =>
    makeBenchmarkCard(index, deck.id),
  );
  await db.cards.bulkAdd(cards);

  const started = performance.now();
  await recordReview({
    card: cards[0],
    deck,
    eventId: 'performance-event',
    sessionId: 'performance-session',
    grade: 3,
    responseTimeSec: 1,
    distracted: false,
    correct: true,
    now: NOW,
  });

  return {
    cardCount: CARD_COUNT,
    singleRecordReviewMs: performance.now() - started,
  };
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

const [session, record, build] = await Promise.all([
  measureSessionEngine(),
  measureRecordReview(),
  measureBuildOutput(),
]);

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
