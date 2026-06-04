// Plain, offline card search. A pure function over already-loaded cards and decks
// so it needs no index server and is trivially testable. Matching is a
// case- and diacritic-insensitive substring over the card front/back, the deck
// name, and the card's tags.

import type { Card, Deck } from './types';
import { isLeech } from '../fsrs/leech';

export interface SearchResult {
  card: Card;
  deck: Deck;
}

/** Structured, content-independent filters that turn search into deck management. */
export type CardFilter = 'due' | 'new' | 'leech' | 'flagged' | 'suspended';

export interface SearchOptions {
  /** All listed filters must match (logical AND). */
  filters?: CardFilter[];
  /** Reference time for the "due" filter; defaults to now. */
  now?: number;
}

/** Whether a single card satisfies one structured filter. */
function matchesFilter(card: Card, filter: CardFilter, now: number): boolean {
  switch (filter) {
    case 'due':
      return card.due !== null && card.due <= now;
    case 'new':
      return card.lastReviewed === null;
    case 'leech':
      return isLeech(card);
    case 'flagged':
      return card.flagged === true;
    case 'suspended':
      return card.suspended === true;
  }
}

/** Lower-case and strip accents so "résumé" matches "resume". */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Find cards matching `query`. Results are ranked so that matches in the card's
 * front rank above matches found only in the back/deck/tags, and earlier matches
 * rank above later ones.
 */
export function searchCards(
  query: string,
  cards: Card[],
  decks: Deck[],
  options: SearchOptions = {},
): SearchResult[] {
  const filters = options.filters ?? [];
  const now = options.now ?? Date.now();
  const q = normalise(query.trim());
  // Nothing to do without either a text query or an active filter.
  if (!q && filters.length === 0) return [];

  const deckById = new Map(decks.map((d) => [d.id, d]));
  const ranked: { card: Card; deck: Deck; score: number }[] = [];

  for (const card of cards) {
    const deck = deckById.get(card.deckId);
    if (!deck) continue;

    // Every active filter must match (AND), narrowing the set before text ranking.
    if (filters.length && !filters.every((f) => matchesFilter(card, f, now))) continue;

    let score = 0;
    if (q) {
      const haystack = normalise(
        [card.front, card.back, deck.name, ...(card.tags ?? [])].join('  '),
      );
      const idx = haystack.indexOf(q);
      if (idx === -1) continue;

      const frontIdx = normalise(card.front).indexOf(q);
      // Front matches rank first; ties broken by earliest match position.
      score = (frontIdx === -1 ? 1_000_000 : frontIdx) + idx;
    }
    ranked.push({ card, deck, score });
  }

  // With a query, rank by match quality; filter-only results keep their input order.
  ranked.sort((a, b) => a.score - b.score);
  return ranked.map(({ card, deck }) => ({ card, deck }));
}

/** A short, plain-text preview of a card's markdown for result lists. */
export function plainPreview(md: string, max = 120): string {
  const text = md
    .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '$1') // cloze -> the answer text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/[#*_`>~$]/g, '') // markdown punctuation
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
