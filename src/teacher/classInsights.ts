import type { DailyEvidence, DailyEvidenceEvent } from '../insights/evidence';

/** Bands shared by cells, dots and bars. Unknown evidence never becomes a zero. */
export type Band = 'secure' | 'partial' | 'gap' | 'unknown';

export function band(score: number | null): Band {
  if (score === null) return 'unknown';
  return score >= 0.75 ? 'secure' : score >= 0.4 ? 'partial' : 'gap';
}

/** One activity as a share of its marks, or recall as 1 or 0; null when not known. */
export function eventScore(event: DailyEvidenceEvent): number | null {
  if (event.marking === 'recall') return event.retained === null ? null : Number(event.retained);
  if (event.earned === null || !event.available) return null;
  return event.earned / event.available;
}

export function mean(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

export function pupilScore(report: DailyEvidence): number | null {
  return mean(report.events.map(eventScore));
}

export interface ItemAnswer {
  report: DailyEvidence;
  event: DailyEvidenceEvent;
  score: number | null;
}

export interface ItemSummary {
  itemId: string;
  prompt: string;
  /** Mean of each pupil's own mean for this item, so repeated attempts do not outweigh others. */
  score: number | null;
  pupils: number;
  /** Pupils whose score for this item falls in the gap band. */
  gaps: number;
  answers: ItemAnswer[];
  /** Each pupil's score for this item, keyed by pupil id. */
  byPupil: Map<string, number | null>;
}

/** Items weakest first; items with only unknown evidence sort last rather than as zero. */
export function summariseItems(reports: readonly DailyEvidence[]): ItemSummary[] {
  const items = new Map<string, ItemSummary & { scores: Map<string, (number | null)[]> }>();
  for (const report of reports) {
    for (const event of report.events) {
      let item = items.get(event.itemId);
      if (!item) {
        item = {
          itemId: event.itemId,
          prompt: event.prompt,
          score: null,
          pupils: 0,
          gaps: 0,
          answers: [],
          byPupil: new Map(),
          scores: new Map(),
        };
        items.set(event.itemId, item);
      }
      if (!item.prompt && event.prompt) item.prompt = event.prompt;
      const score = eventScore(event);
      item.answers.push({ report, event, score });
      const pupil = item.scores.get(report.pupil.id) ?? [];
      pupil.push(score);
      item.scores.set(report.pupil.id, pupil);
    }
  }
  return [...items.values()]
    .map(({ scores, ...item }) => {
      for (const [pupil, values] of scores) item.byPupil.set(pupil, mean(values));
      const perPupil = [...item.byPupil.values()];
      return {
        ...item,
        score: mean(perPupil),
        pupils: perPupil.length,
        gaps: perPupil.filter((value) => band(value) === 'gap').length,
      };
    })
    .sort(
      (a, b) =>
        (a.score ?? 2) - (b.score ?? 2) ||
        b.pupils - a.pupils ||
        a.prompt.localeCompare(b.prompt, 'en-GB'),
    );
}

/** Items most worth teaching again: known, below secure, weakest first. */
export function itemsToRevisit(items: readonly ItemSummary[], limit = 3): ItemSummary[] {
  return items.filter((item) => item.score !== null && item.score < 0.75).slice(0, limit);
}

export interface AnswerGroup {
  answer: string;
  score: number | null;
  answers: ItemAnswer[];
}

/** Identical answers grouped, so a shared misconception reads as one line. Weakest first. */
export function groupAnswers(item: ItemSummary): AnswerGroup[] {
  const groups = new Map<string, AnswerGroup>();
  for (const answer of item.answers) {
    const text = answer.event.answer.trim();
    const { marking, disputed, shortened } = answer.event;
    const key = JSON.stringify([
      text.toLocaleLowerCase('en-GB'),
      answer.score,
      marking,
      disputed,
      shortened,
    ]);
    const group = groups.get(key) ?? { answer: text, score: answer.score, answers: [] };
    group.answers.push(answer);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => (a.score ?? 2) - (b.score ?? 2) || b.answers.length - a.answers.length,
  );
}

export function outcomeLabel(event: DailyEvidenceEvent): string {
  if (event.marking === 'recall')
    return event.retained === null
      ? 'Recall unknown'
      : event.retained
        ? 'Recalled'
        : 'Not recalled';
  return `${event.earned ?? 'Unknown'} / ${event.available ?? 'unknown'} marks`;
}

export function markingLabel(event: DailyEvidenceEvent): string {
  return event.marking === 'self'
    ? 'Self marked'
    : event.marking === 'automatic'
      ? 'Automatic marking'
      : 'Recall';
}

export function percent(score: number | null): string {
  return score === null ? '–' : `${Math.round(score * 100)}%`;
}

/** A UTC reporting day as teachers say it: "Monday 19 October". */
export function dayLabel(day: string, style: 'long' | 'short' = 'long'): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: style,
    day: 'numeric',
    month: style,
    timeZone: 'UTC',
  });
}
