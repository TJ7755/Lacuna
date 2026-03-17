import { getCardsByDeckRecursive } from '../db/repositories/cards';
import { getAllDecks } from '../db/repositories/decks';
import { getCardState } from '../db/repositories/fsrs';
import { getTagsForCards } from '../db/repositories/tags';
import type { OcclusionData } from '../types';

type ExportCardType = 'basic' | 'cloze' | 'image_occlusion';

interface CardExport {
  id: string;
  cardType: ExportCardType;
  front: string;
  back: string;
  clozeText: string | null;
  imageUrl: string | null;
  occlusionData: OcclusionData | null;
  tags: string[];
  updatedAt: string;
  fsrsState: {
    stability: number;
    difficulty: number;
    due: string;
    lastReview: string | null;
    ratingHistory: string[];
  } | null;
}

interface DeckExportNode {
  id: string;
  name: string;
  path: string;
  examDate: string | null;
  updatedAt: string;
  cards: CardExport[];
  children: DeckExportNode[];
}

interface DeckExport {
  version: 1;
  exportedAt: string;
  deck: DeckExportNode;
}

function safeFileName(name: string, ext: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  const base = cleaned.length > 0 ? cleaned : 'deck';
  return `${base}-${ext}`;
}

function triggerDownload(
  fileName: string,
  content: string,
  type: string,
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function findSubtreeDeckIds(
  rootPath: string,
  allPaths: Array<{ id: string; path: string }>,
): string[] {
  return allPaths
    .filter(
      (deck) => deck.path === rootPath || deck.path.startsWith(`${rootPath}::`),
    )
    .map((deck) => deck.id);
}

export async function exportDeckAsJson(deckId: string): Promise<void> {
  const allDecks = await getAllDecks();
  const root = allDecks.find((deck) => deck.id === deckId);

  if (!root) {
    throw new Error('Deck not found.');
  }

  const subtreeIds = new Set(
    findSubtreeDeckIds(
      root.path,
      allDecks.map((deck) => ({ id: deck.id, path: deck.path })),
    ),
  );

  const cardsByDeck = new Map<
    string,
    Awaited<ReturnType<typeof getCardsByDeckRecursive>>
  >();
  for (const deck of allDecks) {
    if (!subtreeIds.has(deck.id)) continue;
    const cards = await getCardsByDeckRecursive(deck.id);
    cardsByDeck.set(
      deck.id,
      cards.filter((card) => card.deck_id === deck.id),
    );
  }

  const allCards = Array.from(cardsByDeck.values()).flat();
  const tagMap = await getTagsForCards(allCards.map((card) => card.id));

  const stateMap: Record<string, Awaited<ReturnType<typeof getCardState>>> = {};
  await Promise.all(
    allCards.map(async (card) => {
      stateMap[card.id] = await getCardState(card.id);
    }),
  );

  const byParent = new Map<string | null, typeof allDecks>();
  for (const deck of allDecks) {
    if (!subtreeIds.has(deck.id)) continue;
    const key = deck.parent_id;
    const list = byParent.get(key) ?? [];
    list.push(deck);
    byParent.set(key, list);
  }

  const buildNode = (deck: (typeof allDecks)[number]): DeckExportNode => {
    const deckCards = cardsByDeck.get(deck.id) ?? [];
    const cards: CardExport[] = deckCards.map((card) => {
      const state = stateMap[card.id];
      return {
        id: card.id,
        cardType: card.card_type,
        front: card.front,
        back: card.back,
        clozeText: card.cloze_text,
        imageUrl: card.image_url,
        occlusionData: (card.occlusion_data as OcclusionData | null) ?? null,
        tags: (tagMap[card.id] ?? []).map((tag) => tag.name),
        updatedAt: card.updated_at.toISOString(),
        fsrsState: state
          ? {
              stability: state.stability,
              difficulty: state.difficulty,
              due: state.due.toISOString(),
              lastReview: state.last_review
                ? state.last_review.toISOString()
                : null,
              ratingHistory: state.rating_history,
            }
          : null,
      };
    });

    const children = (byParent.get(deck.id) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(buildNode);

    return {
      id: deck.id,
      name: deck.name,
      path: deck.path,
      examDate: deck.exam_date ? deck.exam_date.toISOString() : null,
      updatedAt: deck.updated_at.toISOString(),
      cards,
      children,
    };
  };

  const payload: DeckExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    deck: buildNode(root),
  };

  triggerDownload(
    safeFileName(root.name, 'lacuna.json'),
    JSON.stringify(payload, null, 2),
    'application/json',
  );
}

export async function exportDeckAsText(deckId: string): Promise<void> {
  const allDecks = await getAllDecks();
  const root = allDecks.find((deck) => deck.id === deckId);

  if (!root) {
    throw new Error('Deck not found.');
  }

  const cards = await getCardsByDeckRecursive(deckId);
  const lines: string[] = [];

  for (const card of cards) {
    if (card.card_type === 'basic') {
      lines.push(`${card.front}\t${card.back}`);
      continue;
    }

    if (card.card_type === 'cloze') {
      if (card.cloze_text) {
        lines.push(`# cloze ${card.cloze_text}`);
      }
    }
  }

  lines.push('# Image occlusion cards are not included in plain text export.');

  triggerDownload(
    safeFileName(root.name, 'txt'),
    lines.join('\n'),
    'text/plain',
  );
}
