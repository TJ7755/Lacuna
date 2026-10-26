import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberAssetImageSize, resolveAssetUrl } from '../../db/assetCache';
import { assetUrl } from '../../db/assets';
import type { Card } from '../../db/types';
import type { OcclusionCardData } from '../../db/occlusionStudy';
import { defaultFsrsParameters } from '../../fsrs/params';
import { makeSessionContext, selectNext } from '../../fsrs/session';
import { preloadSessionImages, sessionPreloadCards } from './sessionPreload';

vi.mock('../../db/assetCache', () => ({
  resolveAssetUrl: vi.fn(),
  rememberAssetImageSize: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const now = new Date('2026-10-17T12:00:00Z').getTime();
function card(id: string, stability = 2): Card {
  return {
    id,
    conceptId: id,
    courseId: 'biology',
    schedulingUnitId: 'biology',
    type: 'front_back',
    front: `![Cell](${assetUrl(id.padStart(64, '0'))})`,
    back: 'Mitochondrion',
    stability,
    difficulty: 5,
    lastReviewed: now - 10 * 86_400_000,
    reps: 3,
    lapses: 0,
    state: 2,
    due: now - 86_400_000,
    scheduledDays: 2,
    learningSteps: 0,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

it('has nothing to warm in a text-only session', () => {
  const cards = [card('a'), card('b'), card('c')].map((candidate) => ({
    ...candidate,
    front: 'What powers a cell?',
  }));
  const context = makeSessionContext(
    [
      {
        config: {
          id: 'biology',
          examObjective: 'expectedMarks',
          fsrsParameters: defaultFsrsParameters(),
          examDate: now + 30 * 86_400_000,
        },
        scope: { kind: 'course', courseId: 'biology' },
      },
    ],
    'due',
    cards,
  );
  expect(sessionPreloadCards(cards, 'a', context, new Map(), now)).toEqual([]);
});

it.each(['front', 'back', 'payload', 'occlusion'] as const)(
  'retains lookahead for an image referenced by %s',
  (source) => {
    const current = { ...card('a'), front: 'Current question' };
    const next = { ...card('b'), front: 'Next question' };
    const image = card('b').front;
    if (source === 'front' || source === 'back') next[source] = image;
    else if (source === 'payload')
      next.payload = {
        v: 1,
        kind: 'working',
        scheme: [],
        fixtures: [{ id: 'example', studentAnswer: '4', expectedMarks: 1, note: image }],
      };
    else next.occlusionRegionId = 'region-b';
    expect(sessionPreloadCards([current, next], current.id, null, new Map(), now)).toEqual([next]);
  },
);

it.each([false, true])(
  'keeps the complete order and scheduler state unchanged by lookahead (tied scores: %s)',
  (tied) => {
    const cards = [
      card('a', tied ? 2 : 8),
      card('b', tied ? 2 : 1),
      card('c', tied ? 2 : 4),
      card('d', 2),
    ];
    const unit = {
      config: {
        id: 'biology',
        examObjective: 'expectedMarks' as const,
        fsrsParameters: defaultFsrsParameters(),
        examDate: now + 30 * 86_400_000,
      },
      scope: { kind: 'course' as const, courseId: 'biology' },
    };
    function order(preload: boolean) {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0);
      const context = makeSessionContext([unit], 'due', cards);
      random.mockRestore();
      const cooldowns = new Map([['a', 2]]);
      let pool = [...cards];
      const ids: string[] = [];
      let current: Card | null;
      while ((current = selectNext(pool, context, cooldowns, now))) {
        ids.push(current.id);
        if (preload) {
          const snapshot = () =>
            JSON.stringify({
              cards,
              decks: [...context.decks],
              counts: [...(context.initialReviewCounts ?? [])],
              ranks: [...(context.tieBreakRanks ?? [])],
              cooldowns: [...cooldowns],
            });
          const before = snapshot();
          const upcoming = sessionPreloadCards(pool, current.id, context, cooldowns, now);
          expect(upcoming).toHaveLength(Math.min(2, pool.length - 1));
          expect(upcoming).not.toContain(current);
          expect(snapshot()).toBe(before);
        }
        pool = pool.filter((candidate) => candidate.id !== current!.id);
      }
      return ids;
    }
    expect(order(true)).toEqual(order(false));
    expect(order(true)).toHaveLength(4);
    expect(sessionPreloadCards(cards, 'a', null, new Map(), now).map((c) => c.id)).toEqual([
      'b',
      'c',
    ]);
  },
);

describe('image warm-up', () => {
  it('bounds and deduplicates image and occlusion reads without waiting for distant assets', async () => {
    const images: { src: string; decode: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        decode = vi.fn(() => new Promise<void>(() => {}));
        constructor() {
          images.push(this);
        }
      },
    );
    vi.mocked(resolveAssetUrl).mockImplementation(async (hash) => `blob:${hash}`);
    const cards = [card('a'), card('b'), card('c')];
    cards[0].back = cards[0].front;
    const occlusions = new Map<string, OcclusionCardData>([
      [
        'b',
        {
          occlusion: { assetHash: 'f'.repeat(64) } as OcclusionCardData['occlusion'],
          answerText: undefined,
        },
      ],
    ]);
    const stop = preloadSessionImages(cards, occlusions);
    await vi.waitFor(() => expect(images).toHaveLength(3));
    expect(resolveAssetUrl).not.toHaveBeenCalledWith('c'.padStart(64, '0'));
    expect(images.every((image) => image.decode.mock.calls.length === 1)).toBe(true);
    stop();
  });

  it('records natural dimensions only after decoding has completed', async () => {
    let finishDecode!: () => void;
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = 4000;
        naturalHeight = 3000;
        decode() {
          return new Promise<void>((resolve) => {
            finishDecode = resolve;
          });
        }
      },
    );
    vi.mocked(resolveAssetUrl).mockResolvedValue('blob:large');
    const stop = preloadSessionImages([card('a')], new Map());
    await vi.waitFor(() => expect(finishDecode).toBeTypeOf('function'));
    expect(rememberAssetImageSize).not.toHaveBeenCalled();
    finishDecode();
    await vi.waitFor(() =>
      expect(rememberAssetImageSize).toHaveBeenCalledWith('blob:large', 4000, 3000),
    );
    stop();
  });

  it('ignores late asset results after navigation and swallows missing/broken images', async () => {
    let resolve!: (url: string) => void;
    vi.mocked(resolveAssetUrl).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const image = vi.fn();
    vi.stubGlobal('Image', image);
    const stop = preloadSessionImages([card('a')], new Map());
    stop();
    resolve('blob:late');
    await Promise.resolve();
    expect(image).not.toHaveBeenCalled();
    vi.mocked(resolveAssetUrl).mockRejectedValue(new Error('Missing asset'));
    expect(() => preloadSessionImages([card('b')], new Map())).not.toThrow();
    await Promise.resolve();
  });
});
