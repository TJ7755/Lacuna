import type { CardType, ReviewLog } from './types';
import type { ApkgCardDraft } from './apkgTypes';
import { makeId } from '../utils/id';

export interface AnkiNote {
  id: number;
  mid: number;
  flds: string;
  tags: string;
  sfld: string;
}

export interface AnkiCard {
  id: number;
  nid: number;
  did: number;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  odue: number;
  odid: number;
  flags: number;
}

export interface AnkiRevlog {
  id: number;
  cid: number;
  usn: number;
  ease: number;
  ivl: number;
  lastIvl: number;
  factor: number;
  time: number;
  type: number;
}

export interface AnkiModel {
  id: number;
  name: string;
  type: number; // 0 = standard, 1 = cloze
  tmpl: { name: string; qfmt: string; afmt: string }[];
  flds: { name: string }[];
}

interface NoteMapping {
  type: CardType;
  front: string;
  back: string;
  tags: string[];
}

export function mapModelToLacuna(model: AnkiModel, note: AnkiNote): NoteMapping | null {
  const fields = note.flds.split('\x1f');

  if (model.type === 1) {
    // Cloze note type.
    const text = fields[0] ?? '';
    if (!text) return null;
    return {
      type: 'cloze',
      front: convertAnkiCloze(text),
      back: '',
      tags: parseAnkiTags(note.tags),
    };
  }

  if (model.type === 0) {
    // Standard note type. Use the first two fields as front/back.
    const front = fields[0] ?? '';
    const back = fields[1] ?? '';
    if (!front) return null;
    return {
      type: 'front_back',
      front: convertAnkiHtml(front),
      back: convertAnkiHtml(back),
      tags: parseAnkiTags(note.tags),
    };
  }

  // Unsupported model type.
  return null;
}

/** Convert Anki's {{c1::Text}} cloze syntax to Lacuna's {{c1::Text}} (same syntax). */
function convertAnkiCloze(text: string): string {
  // Anki and Lacuna use the same cloze syntax, but Anki may use HTML.
  return convertAnkiHtml(text);
}

const HTML_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Convert Anki HTML fields to Markdown-compatible text. */
function convertAnkiHtml(html: string): string {
  // Convert markup, then decode each original entity once. Chained replacements
  // would decode nested text such as &amp;quot; twice.
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '')
    .replace(/<p\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<i>(.*?)<\/i>/gi, '_$1_')
    .replace(/<em>(.*?)<\/em>/gi, '_$1_')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre>(.*?)<\/pre>/gi, '```\n$1\n```')
    .replace(/<li\s*\/?>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<ul\s*\/?>/gi, '')
    .replace(/<\/ul>/gi, '')
    .replace(/<ol\s*\/?>/gi, '')
    .replace(/<\/ol>/gi, '')
    .replace(/<h1\s*\/?>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2\s*\/?>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3\s*\/?>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/&(?:lt|gt|amp|quot|#39|nbsp);/g, (entity) => HTML_ENTITIES[entity])
    .trim();
}

/** Parse Anki's space-separated tags (may have leading/trailing spaces). */
function parseAnkiTags(tagString: string): string[] {
  return tagString
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !t.startsWith('__'));
}

// ---------------------------------------------------------------------------
// Card builder
// ---------------------------------------------------------------------------

export function buildLacunaCard(
  ankiCard: AnkiCard,
  mapping: NoteMapping,
  revlogs: AnkiRevlog[],
): ApkgCardDraft | null {
  const now = Date.now();

  // Convert Anki state to Lacuna FSRS state.
  const state: 0 | 1 | 2 | 3 = clampState(ankiCard.type);

  // Convert Anki due to epoch ms.
  // Anki due is: days since creation for reviews, or a Unix timestamp for learning.
  // For simplicity, we treat it as days for review cards and use today + days for new.
  const due =
    ankiCard.due > 1000000000
      ? ankiCard.due * 1000 // Unix timestamp
      : now + ankiCard.due * 86400_000; // Days offset

  // Convert review logs.
  const history: ReviewLog[] = revlogs
    .sort((a, b) => a.id - b.id)
    .map((r) => ({
      timestamp: r.id,
      grade: clampGrade(r.ease),
      responseTimeSec: Math.round(r.time / 1000),
      distracted: false,
      stabilityBefore: r.lastIvl > 0 ? r.lastIvl : null,
      stabilityAfter: r.ivl > 0 ? r.ivl : 1,
      difficultyBefore: null,
      difficultyAfter: r.factor / 1000,
      retrievabilityAtReview: null,
    }));

  // Estimate stability from interval (crude approximation for migration).
  const stability = ankiCard.ivl > 0 ? ankiCard.ivl : null;
  const difficulty = ankiCard.factor > 0 ? ankiCard.factor / 1000 : null;

  return {
    id: makeId(),
    deckId: '', // Filled in by the caller.
    schedulingUnitId: '', // Filled in by the caller before persistence.
    type: mapping.type,
    front: mapping.front,
    back: mapping.back,
    stability,
    difficulty,
    lastReviewed: history.length > 0 ? history[history.length - 1].timestamp : null,
    reps: ankiCard.reps,
    lapses: ankiCard.lapses,
    state,
    due: state === 0 ? null : due,
    scheduledDays: ankiCard.ivl,
    learningSteps: ankiCard.left,
    history,
    createdAt: ankiCard.id,
    updatedAt: ankiCard.id,
    tags: mapping.tags,
    suspended: ankiCard.queue === -1,
    buriedUntil: null,
  };
}

function clampState(type: number): 0 | 1 | 2 | 3 {
  if (type === 0) return 0;
  if (type === 1) return 1;
  if (type === 2) return 2;
  if (type === 3) return 3;
  return 0;
}

function clampGrade(ease: number): 1 | 2 | 3 | 4 {
  if (ease === 1) return 1;
  if (ease === 2) return 2;
  if (ease === 3) return 3;
  if (ease === 4) return 4;
  return 3;
}
