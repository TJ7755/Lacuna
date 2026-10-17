import type { QuestionAttempt, QuestionDefinition } from './types';

export type AttemptMark = 'right' | 'wrong' | 'none';

export interface QuestionBankSummary {
  /** Oldest to newest, always `RECENT_MARKS` long; unfilled slots are 'none'. */
  marks: AttemptMark[];
  /** Short record such as "Right 3 of the last 4", or null before any attempt. */
  record: string | null;
  marksAvailable: number | null;
  typicalSeconds: number | null;
}

export const RECENT_MARKS = 5;

function countedAttempts(attempts: readonly QuestionAttempt[]): QuestionAttempt[] {
  return attempts
    .filter(
      (attempt) =>
        attempt.status === 'answered' &&
        attempt.undoneAt === undefined &&
        attempt.marksEarned !== undefined &&
        attempt.marksAvailable !== undefined,
    )
    .sort((left, right) => (left.answeredAt ?? left.shownAt) - (right.answeredAt ?? right.shownAt));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function fixedMarks(question: QuestionDefinition): number | null {
  if (question.kind !== 'fixed') return null;
  if (question.payload.kind === 'numeric') return 1;
  return question.payload.scheme.reduce((total, line) => total + line.marks, 0) || null;
}

/** Everything a bank card shows about a Question, derived from real attempt history. */
export function summariseQuestion(
  question: QuestionDefinition,
  attempts: readonly QuestionAttempt[],
): QuestionBankSummary {
  const counted = countedAttempts(attempts.filter((attempt) => attempt.questionId === question.id));
  const recent = counted.slice(-RECENT_MARKS);
  const results = recent.map(
    (attempt): AttemptMark => (attempt.marksEarned === attempt.marksAvailable ? 'right' : 'wrong'),
  );
  const right = results.filter((mark) => mark === 'right').length;
  const last = counted.at(-1);
  return {
    marks: [...results, ...Array<AttemptMark>(RECENT_MARKS - results.length).fill('none')],
    record: recent.length ? `Right ${right} of the last ${recent.length}` : null,
    marksAvailable: fixedMarks(question) ?? last?.marksAvailable ?? null,
    typicalSeconds: median(
      counted.flatMap((attempt) =>
        attempt.responseTimeSeconds === undefined ? [] : [attempt.responseTimeSeconds],
      ),
    ),
  };
}

export function formatTypicalTime(seconds: number): string {
  return seconds < 60 ? `${Math.max(1, Math.round(seconds))} s` : `${Math.round(seconds / 60)} min`;
}

/** "3 marks · 2 min", dropping whichever half the app has no data for. */
export function formatQuestionMeta(summary: QuestionBankSummary): string | null {
  const parts: string[] = [];
  if (summary.marksAvailable !== null) {
    parts.push(`${summary.marksAvailable} ${summary.marksAvailable === 1 ? 'mark' : 'marks'}`);
  }
  if (summary.typicalSeconds !== null) parts.push(formatTypicalTime(summary.typicalSeconds));
  return parts.length ? parts.join(' · ') : null;
}

/** Bold the generated parameter values in a rendered prompt, leaving maths spans alone. */
export function highlightParameters(
  prompt: string,
  parameters: Record<string, string | number | boolean> | undefined,
): string {
  const values = Object.values(parameters ?? {})
    .map(String)
    .filter((value) => /^-?\d+(\.\d+)?$/.test(value));
  if (values.length === 0) return prompt;
  const escaped = [...new Set(values)]
    .sort((left, right) => right.length - left.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\w.*])(${escaped.join('|')})(?![\\w*]|\\.\\d)`, 'g');
  return prompt
    .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g)
    .map((part, index) => (index % 2 ? part : part.replace(pattern, '**$1**')))
    .join('');
}
