import { db } from './schema';

function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeTsvCell(value: string): string {
  if (value.includes('\t') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeMarkdownPipe(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatRow(values: string[], delimiter: ',' | '\t'): string {
  const escaper = delimiter === ',' ? escapeCsvCell : escapeTsvCell;
  return values.map(escaper).join(delimiter);
}

async function fetchDecksAndCards() {
  const [decks, cards] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
  ]);
  const deckMap = new Map(decks.map((d) => [d.id, d.name]));
  const colourMap = new Map(decks.map((d) => [d.id, d.colour ?? '']));
  return { deckMap, colourMap, cards };
}

const EXPORT_HEADERS = [
  'deck_name',
  'deck_colour',
  'front',
  'back',
  'tags',
  'type',
  'suspended',
  'flagged',
  'created_at',
  'stability',
  'difficulty',
  'reps',
  'lapses',
  'state',
  'due',
];

function cardToRow(
  c: Awaited<ReturnType<typeof fetchDecksAndCards>>['cards'][number],
  deckMap: Map<string, string>,
  colourMap: Map<string, string>,
): string[] {
  return [
    deckMap.get(c.deckId) ?? '',
    colourMap.get(c.deckId) ?? '',
    c.front,
    c.back,
    (c.tags ?? []).join(';'),
    c.type,
    c.suspended ? 'yes' : 'no',
    c.flagged ? 'yes' : 'no',
    new Date(c.createdAt).toISOString(),
    c.stability?.toString() ?? '',
    c.difficulty?.toString() ?? '',
    c.reps.toString(),
    c.lapses.toString(),
    c.state.toString(),
    c.due ? new Date(c.due).toISOString() : '',
  ];
}

const CSV_WARNING = '# WARNING: This is a human-readable export, not a full backup. Re-importing will lose review history, image assets, and FSRS parameters. Use JSON backup for a complete snapshot.\n';

export async function exportCardsCsv(): Promise<string> {
  const { deckMap, colourMap, cards } = await fetchDecksAndCards();
  const rows = [formatRow(EXPORT_HEADERS, ','), ...cards.map((c) => formatRow(cardToRow(c, deckMap, colourMap), ','))];
  return CSV_WARNING + rows.join('\r\n');
}

const TSV_WARNING = '# WARNING: This is a human-readable export, not a full backup. Re-importing will lose review history, image assets, and FSRS parameters. Use JSON backup for a complete snapshot.\n';

export async function exportCardsTsv(): Promise<string> {
  const { deckMap, colourMap, cards } = await fetchDecksAndCards();
  const rows = [formatRow(EXPORT_HEADERS, '\t'), ...cards.map((c) => formatRow(cardToRow(c, deckMap, colourMap), '\t'))];
  return TSV_WARNING + rows.join('\r\n');
}

export async function exportCardsPlainText(): Promise<string> {
  const { deckMap, colourMap, cards } = await fetchDecksAndCards();
  const parts: string[] = [];
  for (const c of cards) {
    const deckName = deckMap.get(c.deckId) ?? 'Unknown deck';
    const deckColour = colourMap.get(c.deckId);
    const tags = (c.tags ?? []).join(', ');
    const lines: string[] = [`Deck: ${deckName}`];
    if (deckColour) lines.push(`Colour: ${deckColour}`);
    if (c.type === 'cloze') {
      lines.push(`Cloze: ${c.front}`);
    } else {
      lines.push(`Q: ${c.front}`);
      lines.push(`A: ${c.back}`);
    }
    if (tags) lines.push(`Tags: ${tags}`);
    if (c.suspended) lines.push('(suspended)');
    if (c.flagged) lines.push('(flagged)');
    lines.push('---');
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Export selected cards as a simple tab-separated plain text: front\tback per line. */
export function exportCardsSimple(
  cards: { front: string; back: string }[],
): string {
  return cards
    .map((c) => {
      const front = escapeTsvCell(c.front);
      const back = escapeTsvCell(c.back);
      return `${front}\t${back}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Markdown table export
// ---------------------------------------------------------------------------

/**
 * Export cards as a GFM Markdown table with front, back, and tags columns.
 * Pipes in cell content are escaped so the table stays valid.
 */
export async function exportCardsMarkdownTable(): Promise<string> {
  const { deckMap, cards } = await fetchDecksAndCards();
  const header = '| Deck | Front | Back | Tags |';
  const separator = '| --- | --- | --- | --- |';
  const rows = cards.map((c) => {
    const deck = escapeMarkdownPipe(deckMap.get(c.deckId) ?? '');
    const front = escapeMarkdownPipe(c.front);
    const back = c.type === 'cloze' ? '' : escapeMarkdownPipe(c.back);
    const tags = escapeMarkdownPipe((c.tags ?? []).join(', '));
    return `| ${deck} | ${front} | ${back} | ${tags} |`;
  });
  return [header, separator, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// JSON array export
// ---------------------------------------------------------------------------

/**
 * Export cards as a JSON array of objects with front, back, tags, and deck
 * keys. Suitable for re-import into Lacuna or other tools.
 */
export async function exportCardsJson(): Promise<string> {
  const { deckMap, cards } = await fetchDecksAndCards();
  const items = cards.map((c) => ({
    front: c.front,
    back: c.back,
    tags: c.tags ?? [],
    deck: deckMap.get(c.deckId) ?? '',
    type: c.type,
  }));
  return JSON.stringify(items, null, 2);
}

// ---------------------------------------------------------------------------
// Review history export
// ---------------------------------------------------------------------------

const REVIEW_HISTORY_HEADERS = [
  'timestamp',
  'deck_name',
  'card_front',
  'grade',
  'response_time_sec',
  'distracted',
  'stability_before',
  'stability_after',
  'difficulty_before',
  'difficulty_after',
  'retrievability_at_review',
];

function gradeLabel(grade: number): string {
  switch (grade) {
    case 1: return 'Again';
    case 2: return 'Hard';
    case 3: return 'Good';
    case 4: return 'Easy';
    default: return String(grade);
  }
}

/** Export every review log across all cards as a CSV. */
export async function exportReviewHistoryCsv(): Promise<string> {
  const { deckMap, cards } = await fetchDecksAndCards();
  const rows: string[] = [formatRow(REVIEW_HISTORY_HEADERS, ',')];
  for (const card of cards) {
    const deckName = deckMap.get(card.deckId) ?? '';
    for (const log of card.history) {
      const front = card.front.slice(0, 120).replace(/\n/g, ' ');
      const row = [
        new Date(log.timestamp).toISOString(),
        deckName,
        front,
        gradeLabel(log.grade),
        String(log.responseTimeSec),
        log.distracted ? 'yes' : 'no',
        log.stabilityBefore?.toString() ?? '',
        String(log.stabilityAfter),
        log.difficultyBefore?.toString() ?? '',
        String(log.difficultyAfter),
        log.retrievabilityAtReview?.toString() ?? '',
      ];
      rows.push(formatRow(row, ','));
    }
  }
  return rows.join('\r\n');
}

/** Export review history as a JSON array of objects. */
export async function exportReviewHistoryJson(): Promise<string> {
  const { deckMap, cards } = await fetchDecksAndCards();
  const items: unknown[] = [];
  for (const card of cards) {
    const deckName = deckMap.get(card.deckId) ?? '';
    for (const log of card.history) {
      items.push({
        timestamp: log.timestamp,
        deck: deckName,
        cardFront: card.front.slice(0, 120),
        grade: gradeLabel(log.grade),
        responseTimeSec: log.responseTimeSec,
        distracted: log.distracted,
        stabilityBefore: log.stabilityBefore,
        stabilityAfter: log.stabilityAfter,
        difficultyBefore: log.difficultyBefore,
        difficultyAfter: log.difficultyAfter,
        retrievabilityAtReview: log.retrievabilityAtReview,
      });
    }
  }
  return JSON.stringify(items, null, 2);
}
