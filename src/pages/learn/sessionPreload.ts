import { resolveAssetUrl } from '../../db/assetCache';
import { referencedAssetHashesInValues } from '../../db/assets';
import type { OcclusionCardData } from '../../db/occlusionStudy';
import type { Card } from '../../db/types';
import { selectNext, type SessionContext } from '../../fsrs/session';
import { makeObjectiveContext } from '../../fsrs/objective';
import type { CooldownMap } from '../../fsrs/cooldown';

const LOOKAHEAD = 2;
const MAX_IMAGES = 6;

/** Predict only a small window; never advance or mutate the real scheduler/queue. */
export function sessionPreloadCards(
  cards: Card[],
  currentId: string,
  context: SessionContext | null,
  cooldowns: CooldownMap,
  now = Date.now(),
): Card[] {
  let remaining = cards.filter((card) => card.id !== currentId);
  if (!context) return remaining.slice(0, LOOKAHEAD);
  // Scoring changes the FSRS engine's fuzz seed, even during selection. Speculation
  // needs its own engines so it cannot affect a later real review.
  const lookaheadContext: SessionContext = {
    ...context,
    decks: new Map([...context.decks].map(([id, unit]) => [id, {
      ...unit, oc: makeObjectiveContext(unit.deck, unit.oc.examDateContext),
    }])),
  };
  const upcoming: Card[] = [];
  while (upcoming.length < LOOKAHEAD) {
    const next = selectNext(remaining, lookaheadContext, cooldowns, now);
    if (!next) break;
    upcoming.push(next);
    remaining = remaining.filter((card) => card.id !== next.id);
  }
  return upcoming;
}

/** Best-effort decoding, with no promise for the session to wait on. Cache owns URLs. */
export function preloadSessionImages(
  cards: Card[],
  occlusions: ReadonlyMap<string, OcclusionCardData>,
): () => void {
  const hashes = new Set<string>();
  for (const card of cards.slice(0, LOOKAHEAD)) {
    const occlusion = occlusions.get(card.id)?.occlusion;
    if (occlusion) hashes.add(occlusion.assetHash);
    for (const hash of referencedAssetHashesInValues(card.front, card.back, card.payload)) {
      hashes.add(hash);
    }
  }
  let cancelled = false;
  const images: HTMLImageElement[] = [];
  for (const hash of [...hashes].slice(0, MAX_IMAGES)) {
    void resolveAssetUrl(hash).then(async (url) => {
      if (cancelled || !url) return;
      const image = new Image();
      images.push(image);
      image.decoding = 'async';
      image.src = url;
      await image.decode();
    }).catch(() => {
      // Missing or undecodable images must never interrupt study.
    });
  }
  return () => {
    cancelled = true;
    images.length = 0;
  };
}
