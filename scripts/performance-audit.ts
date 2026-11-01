import 'fake-indexeddb/auto';
import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { makeSessionContext, selectNext, sessionComplete } from '../apps/web/src/fsrs/session';
import type { Card, SchedulingUnitRecord } from '@lacuna/core/db/types';

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
  import('../apps/web/src/db/repository'),
  import('../apps/web/src/db/schema'),
]);

const NOW = Date.UTC(2026, 7, 12, 12);
const SESSION_CARD_COUNT = 10_000;
const RECORD_REVIEW_CARD_COUNTS = [500, 2_000, 10_000] as const;
const INITIAL_ASSET_BUDGET = {
  javascriptBytes: 910_000,
  // Separate landing dependencies add a small amount of study-entry chunk framing, and the
  // entry graph embeds hashed lazy-chunk names, so any route change moves it by a few bytes.
  javascriptGzipBytes: 285_000,
  scriptRequests: 16,
  // Include the landing styles required to paint prerendered HTML before hydration.
  cssBytes: 150_000,
  cssGzipBytes: 27_000,
  landingJavascriptBytes: 500_000,
  landingJavascriptGzipBytes: 165_000,
  landingScriptRequests: 9,
} as const;

// Optional renderers must remain split; a new monolithic dependency must not hide
// behind the initial-entry budget. The lesson capture remains full-resolution RGB.
const OPTIONAL_ASSET_BUDGET = { javascriptChunkBytes: 700_000, lessonCaptureBytes: 250_000 };

const PUBLIC_ASSET_BUDGET = {
  comparison: {
    javascriptBytes: 1_652_000,
    javascriptGzipBytes: 510_000,
    scriptRequests: 28,
    cssBytes: 190_000,
    cssGzipBytes: 38_000,
  },
  courses: {
    javascriptBytes: 260_000,
    javascriptGzipBytes: 81_000,
    scriptRequests: 8,
    cssBytes: 134_000,
    cssGzipBytes: 24_500,
  },
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
    selectNextMsMedian: benchmark(() => selectNext(cards, context, cooldowns, NOW), 5),
    sessionCompleteMsMedian: benchmark(() => sessionComplete(cards, context, NOW), 5),
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
  const cards = Array.from({ length: cardCount }, (_, index) => makeBenchmarkCard(index, deck.id));
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
    return { available: false as const };
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
  // HTML references alone no longer describe either usable page: the head
  // chooses the study entry or landing hydration entry. Budget both complete
  // static graphs, without including optional routes or the idle app warm-up.
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8')) as Record<
    string,
    { file: string; imports?: string[] }
  >;
  function staticScripts(root: string): Set<string> {
    const visited = new Set<string>();
    const scripts = new Set<string>();
    function visit(key: string): void {
      if (visited.has(key)) return;
      visited.add(key);
      const chunk = manifest[key];
      if (!chunk) throw new Error(`Missing production asset graph entry: ${key}`);
      if (chunk.file.endsWith('.js')) scripts.add(chunk.file.replace('assets/', ''));
      for (const dependency of chunk.imports ?? []) visit(dependency);
    }
    visit(root);
    return scripts;
  }
  const documentScripts = assets.filter((asset) => asset.name.endsWith('.js'));
  function pageScripts(root: string) {
    const names = new Set([...documentScripts.map((asset) => asset.name), ...staticScripts(root)]);
    const scripts = allAssets.filter((asset) => names.has(asset.name));
    if (scripts.length !== names.size) throw new Error(`Missing built scripts for ${root}`);
    return {
      assets: scripts,
      bytes: scripts.reduce((total, asset) => total + asset.bytes, 0),
      gzipBytes: scripts.reduce((total, asset) => total + asset.gzipBytes, 0),
    };
  }
  const manifestByFile = new Map(Object.entries(manifest).map(([key, chunk]) => [chunk.file, key]));
  const publicPages = await Promise.all(
    (await readdir('dist', { recursive: true }))
      .filter((path) => path.endsWith('.html') && path !== 'index.html')
      .sort()
      .map(async (path) => {
        const html = await readFile(`dist/${path}`, 'utf8');
        const references = new Set(
          [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map((match) =>
            match[1].replace('/assets/', ''),
          ),
        );
        const scripts = new Set<string>();
        for (const reference of references) {
          if (!reference.endsWith('.js')) continue;
          const key = manifestByFile.get(`assets/${reference}`);
          if (!key) throw new Error(`Missing production asset graph entry: ${reference}`);
          for (const script of staticScripts(key)) scripts.add(script);
        }
        const javascript = allAssets.filter((asset) => scripts.has(asset.name));
        const css = allAssets.filter(
          (asset) => asset.name.endsWith('.css') && references.has(asset.name),
        );
        return {
          path,
          javascript: {
            assets: javascript,
            bytes: javascript.reduce((total, asset) => total + asset.bytes, 0),
            gzipBytes: javascript.reduce((total, asset) => total + asset.gzipBytes, 0),
          },
          css: {
            assets: css,
            bytes: css.reduce((total, asset) => total + asset.bytes, 0),
            gzipBytes: css.reduce((total, asset) => total + asset.gzipBytes, 0),
          },
        };
      }),
  );
  const initialCss = assets.filter((asset) => asset.name.endsWith('.css'));
  return {
    available: true as const,
    initialJavaScript: pageScripts('index.html'),
    landingJavaScript: pageScripts('src/landingBootstrap.ts'),
    documentJavaScript: documentScripts,
    publicPages,
    initialCss: {
      assets: initialCss,
      bytes: initialCss.reduce((total, asset) => total + asset.bytes, 0),
      gzipBytes: initialCss.reduce((total, asset) => total + asset.gzipBytes, 0),
    },
    optionalAssets: allAssets.filter(
      (asset) => asset.name.endsWith('.js') || /^lesson-.*\.png$/.test(asset.name),
    ),
    largestAssets: allAssets.sort((a, b) => b.bytes - a.bytes).slice(0, 12),
  };
}

type BuildOutput = Awaited<ReturnType<typeof measureBuildOutput>>;

function assertInitialAssetBudget(build: BuildOutput): void {
  if (!build.available) {
    throw new Error('Production assets are missing. Run `bun run build` before the audit.');
  }

  const failures: string[] = [];
  for (const page of build.publicPages) {
    const budget = page.path.startsWith('compare/')
      ? PUBLIC_ASSET_BUDGET.comparison
      : page.path.startsWith('courses/')
        ? PUBLIC_ASSET_BUDGET.courses
        : null;
    if (!budget) throw new Error(`No initial asset budget for shipped HTML: ${page.path}`);
    const checks = [
      ['JavaScript bytes', page.javascript.bytes, budget.javascriptBytes],
      ['JavaScript gzip bytes', page.javascript.gzipBytes, budget.javascriptGzipBytes],
      ['script requests', page.javascript.assets.length, budget.scriptRequests],
      ['CSS bytes', page.css.bytes, budget.cssBytes],
      ['CSS gzip bytes', page.css.gzipBytes, budget.cssGzipBytes],
    ] as const;
    for (const [label, actual, maximum] of checks) {
      if (actual > maximum) failures.push(`${page.path} ${label}: ${actual} > ${maximum}`);
    }
  }
  const checks = [
    ['JavaScript bytes', build.initialJavaScript.bytes, INITIAL_ASSET_BUDGET.javascriptBytes],
    [
      'JavaScript gzip bytes',
      build.initialJavaScript.gzipBytes,
      INITIAL_ASSET_BUDGET.javascriptGzipBytes,
    ],
    ['CSS bytes', build.initialCss.bytes, INITIAL_ASSET_BUDGET.cssBytes],
    ['CSS gzip bytes', build.initialCss.gzipBytes, INITIAL_ASSET_BUDGET.cssGzipBytes],
    [
      'Study script requests',
      build.initialJavaScript.assets.length,
      INITIAL_ASSET_BUDGET.scriptRequests,
    ],
    [
      'Landing JavaScript bytes',
      build.landingJavaScript.bytes,
      INITIAL_ASSET_BUDGET.landingJavascriptBytes,
    ],
    [
      'Landing JavaScript gzip bytes',
      build.landingJavaScript.gzipBytes,
      INITIAL_ASSET_BUDGET.landingJavascriptGzipBytes,
    ],
    [
      'Landing script requests',
      build.landingJavaScript.assets.length,
      INITIAL_ASSET_BUDGET.landingScriptRequests,
    ],
  ] as const;
  for (const [label, actual, maximum] of checks) {
    if (actual > maximum) failures.push(`${label}: ${actual} > ${maximum}`);
  }

  for (const asset of build.optionalAssets) {
    const maximum = asset.name.endsWith('.js')
      ? OPTIONAL_ASSET_BUDGET.javascriptChunkBytes
      : OPTIONAL_ASSET_BUDGET.lessonCaptureBytes;
    if (asset.bytes > maximum) failures.push(`${asset.name} bytes: ${asset.bytes} > ${maximum}`);
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
