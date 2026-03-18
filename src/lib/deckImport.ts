import { and, eq, inArray, isNull } from 'drizzle-orm';
import { createEmptyCard } from 'ts-fsrs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/client';
import {
  addTagToCard,
  getTagsForCard,
  removeTagFromCard,
} from '../db/repositories/tags';
import {
  cards,
  decks,
  fsrs_state,
  sequence_cards,
  sequence_items,
} from '../db/schema';
import { parseApkg } from './apkgImport';
import { UI } from '../ui-strings';

type CardType = 'basic' | 'cloze' | 'image_occlusion';

interface CardExport {
  id: string;
  cardType: CardType;
  front: string;
  back: string;
  clozeText: string | null;
  imageUrl: string | null;
  occlusionData: unknown;
  tags: string[];
  updatedAt?: string;
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
  updatedAt?: string;
  cards: CardExport[];
  children: DeckExportNode[];
}

interface DeckExport {
  version: 1;
  exportedAt: string;
  deck: DeckExportNode;
  sequenceCards?: Array<{
    id: string;
    title: string;
    deckPath: string;
    items: Array<{ position: number; content: string }>;
    itemStates?: Array<{
      position: number;
      state: CardExport['fsrsState'];
    }>;
    sequenceState?: CardExport['fsrsState'];
  }>;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDate(...values: Array<string | null | undefined>): Date {
  for (const value of values) {
    const parsed = parseIsoDate(value);
    if (parsed) return parsed;
  }
  return new Date();
}

function toTagArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function syncCardTags(
  cardId: string,
  expectedNames: string[],
): Promise<void> {
  const current = await getTagsForCard(cardId);
  const expected = new Set(expectedNames.map((name) => name.toLowerCase()));

  for (const tag of current) {
    if (!expected.has(tag.name.toLowerCase())) {
      await removeTagFromCard(cardId, tag.id);
    }
  }

  for (const tagName of expectedNames) {
    await addTagToCard(cardId, tagName);
  }
}

async function upsertDeckNode(
  node: DeckExportNode,
  parentId: string | null,
  exportedAt: string,
): Promise<{ imported: number; updated: number }> {
  const db = await getDb();
  const existingRows = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, node.id), isNull(decks.deleted_at)));

  let imported = 0;
  let updated = 0;

  const incomingUpdatedAt = latestDate(node.updatedAt, exportedAt);

  if (existingRows.length === 0) {
    await db.insert(decks).values({
      id: node.id,
      name: node.name,
      parent_id: parentId,
      path: node.path,
      exam_date: parseIsoDate(node.examDate),
      created_at: incomingUpdatedAt,
      updated_at: incomingUpdatedAt,
      deleted_at: null,
    });
    imported += 1;
  } else if (
    incomingUpdatedAt.getTime() > existingRows[0].updated_at.getTime()
  ) {
    await db
      .update(decks)
      .set({
        name: node.name,
        parent_id: parentId,
        path: node.path,
        exam_date: parseIsoDate(node.examDate),
        updated_at: incomingUpdatedAt,
      })
      .where(eq(decks.id, node.id));
    updated += 1;
  }

  for (const card of node.cards) {
    const currentRows = await db
      .select()
      .from(cards)
      .where(and(eq(cards.id, card.id), isNull(cards.deleted_at)));

    const incomingCardUpdatedAt = latestDate(
      card.updatedAt,
      node.updatedAt,
      exportedAt,
    );

    if (currentRows.length === 0) {
      await db.insert(cards).values({
        id: card.id,
        deck_id: node.id,
        card_type: card.cardType,
        front: card.front,
        back: card.back,
        cloze_text: card.clozeText,
        image_url: card.imageUrl,
        occlusion_data: card.occlusionData,
        created_at: incomingCardUpdatedAt,
        updated_at: incomingCardUpdatedAt,
        deleted_at: null,
      });
      imported += 1;
    } else if (
      incomingCardUpdatedAt.getTime() > currentRows[0].updated_at.getTime()
    ) {
      await db
        .update(cards)
        .set({
          deck_id: node.id,
          card_type: card.cardType,
          front: card.front,
          back: card.back,
          cloze_text: card.clozeText,
          image_url: card.imageUrl,
          occlusion_data: card.occlusionData,
          updated_at: incomingCardUpdatedAt,
        })
        .where(eq(cards.id, card.id));
      updated += 1;
    }

    if (card.fsrsState) {
      const payload: typeof fsrs_state.$inferInsert = {
        id: uuidv4(),
        card_id: card.id,
        stability: card.fsrsState.stability,
        difficulty: card.fsrsState.difficulty,
        due: parseIsoDate(card.fsrsState.due) ?? new Date(),
        last_review: parseIsoDate(card.fsrsState.lastReview),
        rating_history: card.fsrsState.ratingHistory,
        created_at: incomingCardUpdatedAt,
        updated_at: incomingCardUpdatedAt,
        deleted_at: null,
      };

      await db
        .insert(fsrs_state)
        .values(payload)
        .onConflictDoUpdate({
          target: fsrs_state.card_id,
          set: {
            stability: payload.stability,
            difficulty: payload.difficulty,
            due: payload.due,
            last_review: payload.last_review,
            rating_history: payload.rating_history,
            updated_at: payload.updated_at,
            deleted_at: null,
          },
        });
    }

    await syncCardTags(card.id, toTagArray(card.tags));
  }

  for (const child of node.children) {
    const childResult = await upsertDeckNode(child, node.id, exportedAt);
    imported += childResult.imported;
    updated += childResult.updated;
  }

  return { imported, updated };
}

async function upsertSequenceCards(
  sequenceCards: NonNullable<DeckExport['sequenceCards']>,
  exportedAt: string,
): Promise<{ imported: number; updated: number }> {
  const db = await getDb();
  const incomingUpdatedAt = latestDate(exportedAt);
  const allDecks = await db
    .select()
    .from(decks)
    .where(isNull(decks.deleted_at));
  const deckByPath = new Map(allDecks.map((deck) => [deck.path, deck]));

  let imported = 0;
  let updated = 0;

  for (const sequence of sequenceCards) {
    const deck = deckByPath.get(sequence.deckPath);
    if (!deck) {
      continue;
    }

    const existingRows = await db
      .select()
      .from(sequence_cards)
      .where(
        and(
          eq(sequence_cards.id, sequence.id),
          isNull(sequence_cards.deleted_at),
        ),
      );

    if (existingRows.length === 0) {
      await db.insert(sequence_cards).values({
        id: sequence.id,
        deck_id: deck.id,
        title: sequence.title,
        created_at: incomingUpdatedAt,
        updated_at: incomingUpdatedAt,
        deleted_at: null,
      });
      imported += 1;
    } else if (
      incomingUpdatedAt.getTime() > existingRows[0].updated_at.getTime()
    ) {
      await db
        .update(sequence_cards)
        .set({
          deck_id: deck.id,
          title: sequence.title,
          updated_at: incomingUpdatedAt,
          deleted_at: null,
        })
        .where(eq(sequence_cards.id, sequence.id));
      updated += 1;
    }

    const existingItems = await db
      .select({ id: sequence_items.id })
      .from(sequence_items)
      .where(eq(sequence_items.sequence_card_id, sequence.id));
    if (existingItems.length > 0) {
      await db
        .update(sequence_items)
        .set({ deleted_at: incomingUpdatedAt, updated_at: incomingUpdatedAt })
        .where(eq(sequence_items.sequence_card_id, sequence.id));
      await db
        .update(fsrs_state)
        .set({ deleted_at: incomingUpdatedAt, updated_at: incomingUpdatedAt })
        .where(
          inArray(
            fsrs_state.card_id,
            existingItems.map((item) => item.id),
          ),
        );
    }

    const stateByPosition = new Map(
      (sequence.itemStates ?? []).map((entry) => [entry.position, entry.state]),
    );
    for (const item of sequence.items.sort((a, b) => a.position - b.position)) {
      const itemId = uuidv4();
      await db.insert(sequence_items).values({
        id: itemId,
        sequence_card_id: sequence.id,
        position: item.position,
        content: item.content,
        created_at: incomingUpdatedAt,
        updated_at: incomingUpdatedAt,
        deleted_at: null,
      });

      const importedState = stateByPosition.get(item.position);
      const emptyFsrs = createEmptyCard();
      await db.insert(fsrs_state).values({
        id: uuidv4(),
        card_id: itemId,
        stability: importedState?.stability ?? emptyFsrs.stability,
        difficulty: importedState?.difficulty ?? emptyFsrs.difficulty,
        due:
          parseIsoDate(importedState?.due ?? null) ??
          emptyFsrs.due ??
          incomingUpdatedAt,
        last_review: parseIsoDate(importedState?.lastReview ?? null),
        rating_history: importedState?.ratingHistory ?? [],
        created_at: incomingUpdatedAt,
        updated_at: incomingUpdatedAt,
        deleted_at: null,
      });
    }

    const emptyFsrs = createEmptyCard();
    await db
      .insert(fsrs_state)
      .values({
        id: uuidv4(),
        card_id: sequence.id,
        stability: sequence.sequenceState?.stability ?? emptyFsrs.stability,
        difficulty: sequence.sequenceState?.difficulty ?? emptyFsrs.difficulty,
        due:
          parseIsoDate(sequence.sequenceState?.due ?? null) ??
          emptyFsrs.due ??
          incomingUpdatedAt,
        last_review: parseIsoDate(sequence.sequenceState?.lastReview ?? null),
        rating_history: sequence.sequenceState?.ratingHistory ?? [],
        created_at: incomingUpdatedAt,
        updated_at: incomingUpdatedAt,
        deleted_at: null,
      })
      .onConflictDoUpdate({
        target: fsrs_state.card_id,
        set: {
          stability: sequence.sequenceState?.stability ?? emptyFsrs.stability,
          difficulty:
            sequence.sequenceState?.difficulty ?? emptyFsrs.difficulty,
          due:
            parseIsoDate(sequence.sequenceState?.due ?? null) ??
            emptyFsrs.due ??
            incomingUpdatedAt,
          last_review: parseIsoDate(sequence.sequenceState?.lastReview ?? null),
          rating_history: sequence.sequenceState?.ratingHistory ?? [],
          updated_at: incomingUpdatedAt,
          deleted_at: null,
        },
      });
  }

  return { imported, updated };
}

export function parsePastedCards(
  text: string,
  delimiter: '\t' | ';' | ',',
): { cards: Array<{ front: string; back: string }>; skipped: number } {
  // Sequence cards are intentionally not parsed from paste imports because
  // plain delimited rows do not provide reliable sequence structure.
  const cards: Array<{ front: string; back: string }> = [];
  let skipped = 0;

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const delimIndex = rawLine.indexOf(delimiter);
    if (delimIndex < 0) {
      skipped += 1;
      continue;
    }

    const front = rawLine.slice(0, delimIndex).trim();
    const back = rawLine.slice(delimIndex + 1).trim();

    if (!front || !back) {
      skipped += 1;
      continue;
    }

    cards.push({ front, back });
  }

  return { cards, skipped };
}

export async function importDeckFromJson(
  file: File,
): Promise<{ imported: number; updated: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    const parsed = JSON.parse(await file.text()) as DeckExport;

    if (parsed.version !== 1 || !parsed.deck) {
      throw new Error('Unsupported Lacuna export format.');
    }

    const result = await upsertDeckNode(parsed.deck, null, parsed.exportedAt);
    const sequenceResult = parsed.sequenceCards
      ? await upsertSequenceCards(parsed.sequenceCards, parsed.exportedAt)
      : { imported: 0, updated: 0 };
    return {
      imported: result.imported + sequenceResult.imported,
      updated: result.updated + sequenceResult.updated,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { imported: 0, updated: 0, errors };
  }
}

export async function importDeckFromApkg(
  file: File,
): Promise<{ imported: number; skipped: number; warnings: string[] }> {
  const warnings: string[] = [];
  const parsed = await parseApkg(file);
  const db = await getDb();

  const allExistingDecks = await db
    .select()
    .from(decks)
    .where(isNull(decks.deleted_at));
  const deckPathToId = new Map(
    allExistingDecks.map((deck) => [deck.path, deck.id]),
  );
  const ankiDeckIdToLacunaId = new Map<string, string>();

  const ensureDeck = async (path: string): Promise<string> => {
    const cleanedPath = path.trim();
    if (!cleanedPath) {
      throw new Error('Anki deck path is empty.');
    }

    const cached = deckPathToId.get(cleanedPath);
    if (cached) {
      return cached;
    }

    const parts = cleanedPath.split('::');
    let parentId: string | null = null;
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}::${part}` : part;
      const existing = deckPathToId.get(currentPath);

      if (existing) {
        parentId = existing;
        continue;
      }

      const id = uuidv4();
      await db.insert(decks).values({
        id,
        name: part,
        parent_id: parentId,
        path: currentPath,
      });

      deckPathToId.set(currentPath, id);
      parentId = id;
    }

    return parentId ?? '';
  };

  for (const deck of parsed.decks) {
    const lacunaDeckId = await ensureDeck(deck.path);
    ankiDeckIdToLacunaId.set(deck.id, lacunaDeckId);
  }

  let imported = 0;
  let skipped = 0;

  for (const note of parsed.notes) {
    const deckId = ankiDeckIdToLacunaId.get(note.deckId);
    if (!deckId) {
      skipped += 1;
      warnings.push(
        UI.decks.importApkgLogMissingDeck(note.noteId, note.deckId),
      );
      continue;
    }

    const cardType = note.cardType;
    const modelName = note.modelName.toLowerCase();
    const clozeSequencePattern =
      /\bcloze\b.*\bsequence\b|\bsequence\b.*\bcloze\b/;
    if (clozeSequencePattern.test(modelName)) {
      skipped += 1;
      warnings.push(
        UI.decks.importApkgLogSkippedSequence(note.noteId, note.modelName),
      );
      continue;
    }

    const front = note.front.trim();
    const back = note.back.trim();
    const clozeText = note.clozeText?.trim() ?? null;

    if (cardType === 'basic' && (!front || !back)) {
      skipped += 1;
      warnings.push(UI.decks.importApkgLogMissingBasicFields(note.noteId));
      continue;
    }

    if (cardType === 'cloze' && !clozeText) {
      skipped += 1;
      warnings.push(UI.decks.importApkgLogMissingCloze(note.noteId));
      continue;
    }

    const cardId = uuidv4();
    await db.insert(cards).values({
      id: cardId,
      deck_id: deckId,
      card_type: cardType,
      front,
      back,
      cloze_text: clozeText,
      image_url: null,
      occlusion_data: null,
    });

    const now = new Date();
    const emptyFsrs = createEmptyCard();
    await db.insert(fsrs_state).values({
      id: uuidv4(),
      card_id: cardId,
      stability: emptyFsrs.stability,
      difficulty: emptyFsrs.difficulty,
      due: emptyFsrs.due ?? now,
      last_review: emptyFsrs.last_review ?? null,
      rating_history: [],
    });

    for (const tag of note.tags) {
      await addTagToCard(cardId, tag);
    }

    imported += 1;
    if (note.convertedFrom) {
      warnings.push(
        UI.decks.importApkgLogConverted(note.noteId, note.convertedFrom),
      );
    } else {
      warnings.push(UI.decks.importApkgLogImported(note.noteId, cardType));
    }
  }

  if (parsed.media && Object.keys(parsed.media).length === 0) {
    warnings.push(UI.decks.importApkgNoMedia);
  }

  return { imported, skipped, warnings };
}

export async function countDeckSubtreeCards(deckId: string): Promise<{
  cardCount: number;
  subDeckCount: number;
  deckName: string;
}> {
  const db = await getDb();
  const allDecks = await db
    .select()
    .from(decks)
    .where(isNull(decks.deleted_at));
  const root = allDecks.find((deck) => deck.id === deckId);

  if (!root) {
    throw new Error('Deck not found.');
  }

  const descendantIds = allDecks
    .filter(
      (deck) =>
        deck.path === root.path || deck.path.startsWith(`${root.path}::`),
    )
    .map((deck) => deck.id);

  const countRows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(
      and(inArray(cards.deck_id, descendantIds), isNull(cards.deleted_at)),
    );

  return {
    cardCount: countRows.length,
    subDeckCount: Math.max(descendantIds.length - 1, 0),
    deckName: root.name,
  };
}
