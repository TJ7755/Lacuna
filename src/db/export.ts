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
  const [decks, cards, courses, lessons] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.courses.toArray(),
    db.lessons.toArray(),
  ]);
  const deckMap = new Map(decks.map((d) => [d.id, d.name]));
  const colourMap = new Map(decks.map((d) => [d.id, d.colour ?? '']));
  const courseNameMap = new Map(courses.map((c) => [c.id, c.name]));
  const courseColourMap = new Map(courses.map((c) => [c.id, c.colour ?? '']));
  const lessonNameMap = new Map(lessons.map((l) => [l.id, l.name]));
  return { deckMap, colourMap, courseNameMap, courseColourMap, lessonNameMap, cards };
}

/**
 * Resolve the display name and colour for a card's deck/course grouping.
 * Course-created cards resolve to "<Course name> — <Lesson name>" (or just the
 * course name when no lesson is set), taking precedence over the raw backing
 * deck name. Legacy deck-only cards fall back to the deck map unchanged.
 */
function resolveDeckDisplay(
  c: { deckId: string; courseId?: string | null; primaryLessonId?: string | null },
  maps: Pick<
    Awaited<ReturnType<typeof fetchDecksAndCards>>,
    'deckMap' | 'colourMap' | 'courseNameMap' | 'courseColourMap' | 'lessonNameMap'
  >,
): { name: string; colour: string } {
  if (c.courseId) {
    const courseName = maps.courseNameMap.get(c.courseId);
    if (courseName !== undefined) {
      const lessonName = c.primaryLessonId ? maps.lessonNameMap.get(c.primaryLessonId) : undefined;
      const name = lessonName ? `${courseName} — ${lessonName}` : courseName;
      const colour = maps.courseColourMap.get(c.courseId) ?? '';
      return { name, colour };
    }
  }
  return { name: maps.deckMap.get(c.deckId) ?? '', colour: maps.colourMap.get(c.deckId) ?? '' };
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
  maps: Pick<
    Awaited<ReturnType<typeof fetchDecksAndCards>>,
    'deckMap' | 'colourMap' | 'courseNameMap' | 'courseColourMap' | 'lessonNameMap'
  >,
): string[] {
  const { name, colour } = resolveDeckDisplay(c, maps);
  return [
    name,
    colour,
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

const CSV_WARNING =
  '# WARNING: This is a human-readable export, not a full backup. Re-importing will lose review history, image assets, and FSRS parameters. Use JSON backup for a complete snapshot.\n';

export async function exportCardsCsv(): Promise<string> {
  const maps = await fetchDecksAndCards();
  const rows = [
    formatRow(EXPORT_HEADERS, ','),
    ...maps.cards.map((c) => formatRow(cardToRow(c, maps), ',')),
  ];
  return CSV_WARNING + rows.join('\r\n');
}

const TSV_WARNING =
  '# WARNING: This is a human-readable export, not a full backup. Re-importing will lose review history, image assets, and FSRS parameters. Use JSON backup for a complete snapshot.\n';

export async function exportCardsTsv(): Promise<string> {
  const maps = await fetchDecksAndCards();
  const rows = [
    formatRow(EXPORT_HEADERS, '\t'),
    ...maps.cards.map((c) => formatRow(cardToRow(c, maps), '\t')),
  ];
  return TSV_WARNING + rows.join('\r\n');
}

export async function exportCardsPlainText(): Promise<string> {
  const maps = await fetchDecksAndCards();
  const parts: string[] = [];
  for (const c of maps.cards) {
    const { name, colour } = resolveDeckDisplay(c, maps);
    const deckName = name || 'Unknown deck';
    const deckColour = colour;
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
export function exportCardsSimple(cards: { front: string; back: string }[]): string {
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
  const maps = await fetchDecksAndCards();
  const header = '| Deck | Front | Back | Tags |';
  const separator = '| --- | --- | --- | --- |';
  const rows = maps.cards.map((c) => {
    const deck = escapeMarkdownPipe(resolveDeckDisplay(c, maps).name);
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
  const maps = await fetchDecksAndCards();
  const items = maps.cards.map((c) => ({
    front: c.front,
    back: c.back,
    tags: c.tags ?? [],
    deck: resolveDeckDisplay(c, maps).name,
    type: c.type,
  }));
  return JSON.stringify(items, null, 2);
}

// ---------------------------------------------------------------------------
// Review history export
// ---------------------------------------------------------------------------

const REVIEW_HISTORY_HEADERS = [
  'timestamp',
  'event_id',
  'session_id',
  'session_kind',
  'revision_plan_id',
  'revision_window_id',
  'deck_name',
  'card_front',
  'grade',
  'grade_label',
  'correct',
  'response_time_sec',
  'hint_used',
  'distracted',
  'stability_before',
  'stability_after',
  'difficulty_before',
  'difficulty_after',
  'retrievability_at_review',
];

function gradeLabel(grade: number): string {
  switch (grade) {
    case 1:
      return 'Again';
    case 2:
      return 'Hard';
    case 3:
      return 'Good';
    case 4:
      return 'Easy';
    default:
      return String(grade);
  }
}

/** Export every review log across all cards as a CSV. */
export async function exportReviewHistoryCsv(): Promise<string> {
  const maps = await fetchDecksAndCards();
  const rows: string[] = [formatRow(REVIEW_HISTORY_HEADERS, ',')];
  for (const card of maps.cards) {
    const deckName = resolveDeckDisplay(card, maps).name;
    for (const log of card.history) {
      const front = card.front.slice(0, 120).replace(/\n/g, ' ');
      const row = [
        String(log.timestamp),
        log.eventId ?? '',
        log.sessionId ?? '',
        log.sessionKind ?? '',
        log.revisionPlanId ?? '',
        log.revisionWindowId ?? '',
        deckName,
        front,
        String(log.grade),
        gradeLabel(log.grade),
        (log.correct ?? log.grade > 1) ? 'yes' : 'no',
        String(log.responseTimeSec),
        log.hintUsed ? 'yes' : 'no',
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
  const maps = await fetchDecksAndCards();
  const items: unknown[] = [];
  for (const card of maps.cards) {
    const deckName = resolveDeckDisplay(card, maps).name;
    for (const log of card.history) {
      items.push({
        eventId: log.eventId,
        sessionId: log.sessionId,
        sessionKind: log.sessionKind,
        revisionPlanId: log.revisionPlanId,
        revisionWindowId: log.revisionWindowId,
        timestamp: log.timestamp,
        deck: deckName,
        cardFront: card.front.slice(0, 120),
        grade: log.grade,
        gradeLabel: gradeLabel(log.grade),
        correct: log.correct ?? log.grade > 1,
        responseTimeSec: log.responseTimeSec,
        hintUsed: log.hintUsed ?? false,
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
