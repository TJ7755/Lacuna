import { db } from '../db/schema';
import type { Card } from '../db/types';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import type { QuestionAttempt } from '../questions/types';
import type { QuestionAnswer } from '../questions/questionSets';
import type {
  QuestionSetAttemptRecord,
  QuestionSetResponseValue,
} from '../questions/questionSetAttempts';
import { DAY_MS, isoDayStartMs } from '../../../relay/shared/insights/index';
import {
  DailyEvidenceTooLargeError,
  encodeDailyEvidence,
  type DailyEvidence,
  type DailyEvidenceEvent,
} from './evidence';

type Collection = Pick<DailyEvidence, 'shareId' | 'day' | 'pupil'> & { courseId: string };
const CAPS = { reviews: 200, questions: 100, papers: 5 };
const bounded = (value: string, max: number) => value.slice(0, max);

/** Read a bounded, consistent local snapshot; no writes, network or scheduler access. */
export async function collectDailyEvidence(options: Collection): Promise<Uint8Array<ArrayBuffer>> {
  const start = isoDayStartMs(options.day),
    end = start + DAY_MS;
  const during = (at?: number) => at !== undefined && at >= start && at < end;
  const snapshot = await db.transaction(
    'r',
    [
      db.courses,
      db.cards,
      db.reviewHistory,
      db.questionAttempts,
      db.questionSetAttempts,
      db.questionConcepts,
    ],
    async () => {
      if (!(await db.courses.get(options.courseId)))
        throw new Error('The reporting course no longer exists.');
      const reviewsQuery = () =>
        db.reviewHistory
          .where('timestamp')
          .between(start, end, true, false)
          .filter((row) => row.courseId === options.courseId);
      const questionsQuery = () =>
        db.questionAttempts
          .where('courseId')
          .equals(options.courseId)
          .filter(
            (row) =>
              row.status === 'answered' &&
              row.undoneAt === undefined &&
              during(row.answeredAt) &&
              row.receiptOrigin !== 'legacy-reconstructed' &&
              row.historicalPresentationKnown !== false,
          );
      const papersQuery = () =>
        db.questionSetAttempts
          .where('courseId')
          .equals(options.courseId)
          .filter((row) => row.status === 'complete' && during(row.completedAt));
      const [reviews, attempts, papers, reviewCount, questionCount, paperCount] = await Promise.all(
        [
          reviewsQuery().reverse().limit(CAPS.reviews).toArray(),
          questionsQuery().limit(CAPS.questions).toArray(),
          papersQuery().limit(CAPS.papers).toArray(),
          reviewsQuery().count(),
          questionsQuery().count(),
          papersQuery().count(),
        ],
      );
      const cards = await db.cards.bulkGet(reviews.map((row) => row.cardId));
      const links = await db.questionConcepts.bulkGet(attempts.map((row) => row.questionId));
      return {
        links,
        reviews,
        cards,
        attempts,
        papers,
        unexamined:
          reviewCount -
          reviews.length +
          questionCount -
          attempts.length +
          paperCount -
          papers.length,
      };
    },
  );
  const rows: DailyEvidenceEvent[] = [];
  let omitted = snapshot.unexamined;
  snapshot.reviews.forEach((review, index) => {
    const card = snapshot.cards[index];
    // Never disclose a moved/deleted card or reinterpret its old mark scheme using current content.
    if (!card || card.courseId !== options.courseId) {
      omitted += 1;
      return;
    }
    rows.push(cardEvent(review, card));
  });
  rows.push(
    ...snapshot.attempts.map((attempt, i) =>
      questionEvent(
        attempt,
        snapshot.links[i]?.courseId === options.courseId ? snapshot.links[i]!.targetConceptIds : [],
      ),
    ),
  );
  for (const paper of snapshot.papers) {
    const nodes = paperNodes(paper);
    omitted += Math.max(0, nodes.length - 200);
    rows.push(...nodes.slice(0, 200));
  }
  rows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  const events: DailyEvidenceEvent[] = [];
  for (const row of rows) {
    // Legacy event ids can contain whole receipts. Digest them outside the IndexedDB transaction.
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.id));
    row.id = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
    if (events.length === 200) {
      omitted += 1;
      continue;
    }
    try {
      encodeDailyEvidence({
        shareId: options.shareId,
        day: options.day,
        pupil: options.pupil,
        events: [...events, row],
        omitted: omitted + rows.length,
      });
    } catch (error) {
      if (error instanceof DailyEvidenceTooLargeError) {
        omitted += 1;
        continue;
      }
      throw error;
    }
    events.push(row);
  }
  return encodeDailyEvidence({
    shareId: options.shareId,
    day: options.day,
    pupil: options.pupil,
    events,
    omitted,
  });
}

function base(
  id: string,
  kind: DailyEvidenceEvent['kind'],
  at: number,
  itemId: string,
): DailyEvidenceEvent {
  return {
    id,
    kind,
    at,
    itemId,
    prompt: '',
    answer: '',
    conceptIds: [],
    earned: null,
    available: null,
    retained: null,
    criteria: [],
    marking: 'recall',
    disputed: false,
    shortened: false,
  };
}
function cardEvent(review: ReviewHistoryEntry, card: Card): DailyEvidenceEvent {
  const answer = review.lineVerdicts?.map((line) => line.studentLine).join('\n') ?? '';
  const withheld = review.lineVerdicts?.some((line) => line.undetermined) === true;
  return {
    ...base(`card:${review.id}`, 'card', review.timestamp, card.id),
    prompt: 'Card recall',
    answer: bounded(answer, 4000),
    conceptIds: [card.conceptId],
    retained: review.correct ?? review.grade > 1,
    earned: withheld ? null : (review.marksEarned ?? null),
    available: review.marksAvailable ?? null,
    marking: review.marksAvailable === undefined ? 'recall' : 'automatic',
    disputed: Boolean(review.checkerDisputes?.length),
    shortened: answer.length > 4000,
  };
}
function questionEvent(attempt: QuestionAttempt, conceptIds: string[]): DailyEvidenceEvent {
  const answer = Array.isArray(attempt.submittedAnswer)
    ? attempt.submittedAnswer.join('\n')
    : (attempt.submittedAnswer ?? '');
  const withheld = attempt.lineVerdicts?.some((line) => line.undetermined) === true;
  const criteria: DailyEvidenceEvent['criteria'] =
    attempt.resolvedPayload.kind === 'working'
      ? attempt.resolvedPayload.scheme.slice(0, 32).map((line, index) => ({
          id: `${attempt.questionId}:v${attempt.contentVersion}:${index}`,
          label: bounded(line.label ?? `Criterion ${index + 1}`, 500),
          available: line.marks,
          earned:
            withheld || attempt.lineVerdicts === undefined
              ? null
              : Math.min(
                  line.marks,
                  attempt.lineVerdicts
                    .filter((verdict) => verdict.matchedLineIndex === index)
                    .reduce((sum, verdict) => sum + verdict.marksEarned, 0),
                ),
        }))
      : [];
  return {
    ...base(`question:${attempt.id}`, 'question', attempt.answeredAt!, attempt.questionId),
    prompt: bounded(attempt.renderedPrompt, 2000),
    answer: bounded(answer, 4000),
    conceptIds: conceptIds.slice(0, 32),
    earned: withheld ? null : (attempt.marksEarned ?? null),
    available: attempt.marksAvailable ?? null,
    criteria,
    marking: 'automatic',
    disputed: Boolean(attempt.checkerDisputes?.length),
    shortened:
      conceptIds.length > 32 ||
      attempt.renderedPrompt.length > 2000 ||
      answer.length > 4000 ||
      (attempt.resolvedPayload.kind === 'working' &&
        (attempt.resolvedPayload.scheme.length > 32 ||
          attempt.resolvedPayload.scheme.some((line) => (line.label?.length ?? 0) > 500))),
  };
}
function responseText(value: QuestionSetResponseValue | undefined, answer: QuestionAnswer): string {
  return !value
    ? ''
    : value.kind === 'multiple-choice'
      ? value.selectedOptionIds
          .map((id) => {
            const option =
              answer.response.kind === 'multiple-choice'
                ? answer.response.options.find((option) => option.id === id)
                : undefined;
            return option ? `${id}: ${option.content}` : `Unknown option: ${id}`;
          })
          .join('\n')
      : value.text;
}
function paperNodes(attempt: QuestionSetAttemptRecord): DailyEvidenceEvent[] {
  const nodes: { id: string; prompt: string; answer?: QuestionAnswer }[] = [];
  for (const question of attempt.receipt.questions) {
    nodes.push(question);
    for (const part of question.parts) {
      nodes.push({ ...part, prompt: `${question.prompt}\n${part.prompt}` });
      for (const subpart of part.subparts)
        nodes.push({ ...subpart, prompt: `${question.prompt}\n${part.prompt}\n${subpart.prompt}` });
    }
  }
  return nodes
    .filter((node) => node.answer)
    .map((node) => {
      const answer = node.answer!;
      const criteria = answer.allocations.slice(0, 32).map((allocation) => {
        const decision = attempt.decisions.find((row) => row.allocationId === allocation.id);
        return {
          id: allocation.id,
          label: bounded(allocation.criterion, 500),
          earned: decision?.status === 'awarded' ? decision.marks : null,
          available: allocation.maxMarks,
        };
      });
      const text = responseText(
        attempt.responses.find((row) => row.nodeId === node.id)?.submitted,
        answer,
      );
      return {
        ...base(`paper:${attempt.id}:${node.id}`, 'question-set', attempt.completedAt!, node.id),
        prompt: bounded(node.prompt, 2000),
        answer: bounded(text, 4000),
        earned:
          criteria.length === answer.allocations.length &&
          criteria.every((row) => row.earned !== null)
            ? criteria.reduce((sum, row) => sum + row.earned!, 0)
            : null,
        available: answer.maxMarks,
        criteria,
        conceptIds: [
          ...new Set(answer.allocations.flatMap((allocation) => allocation.targetConceptIds)),
        ].slice(0, 32),
        marking: 'self' as const,
        shortened:
          node.prompt.length > 2000 ||
          text.length > 4000 ||
          answer.allocations.length > 32 ||
          answer.allocations.some((allocation) => allocation.criterion.length > 500),
      };
    });
}
