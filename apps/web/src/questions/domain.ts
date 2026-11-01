import {
  CURRENT_ITEM_PAYLOAD_VERSION,
  type Card,
  type LessonCardLink,
  type ReviewLog,
} from '../db/types';
import { reviewHistoryEntryId, type ReviewHistoryEntry } from '../db/reviewHistory';
import { baseItemId } from '../db/sequenceGeneration';
import { serialiseMarkScheme } from '../items/markSchemeCompiler';
import { itemPayloadIsValid } from '../items/payloadValidation';
import type {
  FixedQuestionDefinition,
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionPayload,
  QuestionScheduleState,
} from './types';

type LegacyQuestionModeCard = Omit<Card, 'conceptId' | 'payload'> & {
  conceptId?: string;
  payload?: unknown;
};

export interface QuestionModeMigrationInput {
  cards: LegacyQuestionModeCard[];
  /** When supplied, canonical rows are authoritative even when the array is empty. */
  reviewHistory?: ReviewHistoryEntry[];
  lessonCardLinks?: Pick<LessonCardLink, 'id' | 'lessonId' | 'cardId'>[];
  /** Structured Cards involved in unresolved lineage work remain compatibility Cards. */
  protectedCardIds?: ReadonlySet<string>;
}

export interface QuestionModeMigrationResult {
  cards: Array<LegacyQuestionModeCard & { conceptId: string }>;
  concepts: Concept[];
  questions: FixedQuestionDefinition[];
  questionConcepts: QuestionConceptSet[];
  attempts: QuestionAttempt[];
  removedCardIds: string[];
  removedReviewHistoryIds: string[];
  removedLessonCardLinkIds: string[];
}

function encoded(value: string): string {
  return encodeURIComponent(value);
}

function courseScope(card: LegacyQuestionModeCard): string | null {
  return typeof card.courseId === 'string' && card.courseId.trim() ? card.courseId : null;
}

function scopeKey(card: LegacyQuestionModeCard): string {
  return courseScope(card) === null
    ? `legacy-scheduling-unit:${card.schedulingUnitId}`
    : `course:${courseScope(card)}`;
}

function groupKey(
  card: LegacyQuestionModeCard,
  cardsById: ReadonlyMap<string, LegacyQuestionModeCard>,
): string {
  if (card.reverseCardId) {
    const peer = cardsById.get(card.reverseCardId);
    const reciprocal = peer?.reverseCardId === card.id && courseScope(peer) === courseScope(card);
    if (reciprocal) {
      const first = [card.id, peer.id].sort()[0];
      return `reversed:${first}`;
    }
  }
  if (card.sequenceItemId) {
    return `sequence:${baseItemId(card.sequenceItemId)}`;
  }
  if (card.occlusionRegionId) return `occlusion:${card.occlusionRegionId}`;
  return `card:${card.id}`;
}

function conceptIdFor(group: string): string {
  return `concept:migrated:${encoded(group)}`;
}

function questionIdFor(cardId: string): string {
  return `question:migrated-card:${encoded(cardId)}`;
}

function attemptIdFor(cardId: string, review: ReviewLog, index: number): string {
  const source = review.eventId?.trim() || `${review.timestamp}:${index}`;
  return `question-attempt:migrated:${encoded(cardId)}:${encoded(source)}`;
}

function normaliseReadableText(source: unknown): string {
  if (typeof source !== 'string') return '';
  return source
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\{\{c\d+::([^}:]+)(?:::[^}]+)?\}\}/g, '$1')
    .replace(/[`*_>#~[\]]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readableName(card: LegacyQuestionModeCard): string {
  const preferred = card.type === 'cloze' ? card.front : card.back || card.front;
  const fallback = preferred === card.front ? card.back : card.front;
  const name = normaliseReadableText(preferred) || normaliseReadableText(fallback);
  if (!name) return 'Untitled concept';
  return name.length > 96 ? `${name.slice(0, 95).trimEnd()}…` : name;
}

function questionName(card: LegacyQuestionModeCard): string {
  const name = normaliseReadableText(card.front) || normaliseReadableText(card.back);
  if (!name) throw new Error(`Card ${card.id} has no readable Question name.`);
  return name.length > 96 ? `${name.slice(0, 95).trimEnd()}…` : name;
}

function legacyExplanation(card: LegacyQuestionModeCard, payload: QuestionPayload): string {
  if (typeof card.back === 'string' && card.back.trim()) return card.back;
  if (payload.kind === 'numeric') {
    if (payload.answer.kind === 'matches-one-of') {
      return `Expected answer: ${payload.answer.values.join(' or ')}.`;
    }
    const tolerance = payload.answer.kind === 'within' ? ` within ${payload.answer.tolerance}` : '';
    return `Expected answer: ${payload.answer.value}${tolerance}.`;
  }
  return `Mark scheme:\n\n${serialiseMarkScheme(payload.scheme)}`;
}

function knownQuestionPayload(payload: unknown): payload is QuestionPayload {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as { v?: unknown; kind?: unknown };
  return (
    candidate.v === CURRENT_ITEM_PAYLOAD_VERSION &&
    (candidate.kind === 'numeric' || candidate.kind === 'working') &&
    itemPayloadIsValid(payload)
  );
}

function scheduleOf(card: LegacyQuestionModeCard): QuestionScheduleState {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    lastReviewed: card.lastReviewed,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    due: card.due,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
  };
}

function reviewsForCard(
  card: LegacyQuestionModeCard,
  canonical: ReviewHistoryEntry[] | undefined,
): Array<ReviewLog & { canonicalId: string }> {
  if (canonical === undefined) {
    const occurrences = new Map<string, number>();
    return (card.history ?? []).map((review) => {
      const base = reviewHistoryEntryId(card.id, review);
      const occurrence = occurrences.get(base) ?? 0;
      occurrences.set(base, occurrence + 1);
      return { ...review, canonicalId: occurrence === 0 ? base : `${base}:${occurrence}` };
    });
  }
  return canonical
    .filter((entry) => entry.cardId === card.id)
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    .map(({ id, cardId: _cardId, ...entry }) => ({ ...entry, canonicalId: id }));
}

function migratedAttempt(
  question: FixedQuestionDefinition,
  sourceCardId: string,
  review: ReviewLog & { canonicalId: string },
  index: number,
): QuestionAttempt {
  return {
    id: attemptIdFor(sourceCardId, review, index),
    questionId: question.id,
    courseId: question.courseId,
    contentVersion: question.contentVersion,
    contentRevisionId: question.contentRevisionId,
    scheduleEpochId: question.scheduleEpoch.id,
    purpose: 'post-instruction',
    shownAt: review.timestamp,
    answeredAt: review.timestamp,
    updatedAt: review.timestamp,
    status: 'answered',
    receiptOrigin: 'legacy-reconstructed',
    sourceCardId,
    sourceReviewId: review.canonicalId,
    historicalPresentationKnown: false,
    renderedPrompt: question.prompt,
    resolvedPayload: question.payload,
    renderedExplanation: question.explanation,
    submittedAnswer:
      question.payload.kind === 'working' && review.lineVerdicts
        ? review.lineVerdicts.map((line) => line.studentLine)
        : undefined,
    submittedAnswerKnown: question.payload.kind === 'working' && !!review.lineVerdicts,
    marksEarned: review.marksEarned,
    marksAvailable: review.marksAvailable,
    lineVerdicts: review.lineVerdicts,
    checkerDisputes: review.checkerDisputes,
    responseTimeSeconds: review.responseTimeSec,
    grade: review.grade,
    retrievabilityAtAttempt: review.retrievabilityAtReview,
    scheduleEffect:
      question.scheduleEpoch.baseline.kind === 'legacy-replayable'
        ? { kind: 'replay', grade: review.grade }
        : { kind: 'included-in-opaque-baseline' },
    sessionId: review.sessionId?.trim() || `legacy:${question.id}`,
  };
}

/**
 * Pure v24/backup-v10 conversion. Every generated identity is derived from a
 * stable source identity so two devices upgrading independently converge.
 */
export function migrateQuestionModeContent(
  input: QuestionModeMigrationInput,
): QuestionModeMigrationResult {
  const sortedCards = [...input.cards].sort((a, b) => a.id.localeCompare(b.id));
  const cardsById = new Map(sortedCards.map((card) => [card.id, card]));
  const groups = new Map<string, LegacyQuestionModeCard[]>();
  for (const card of sortedCards) {
    const key = groupKey(card, cardsById);
    const group = groups.get(key) ?? [];
    group.push(card);
    groups.set(key, group);
  }

  const conceptIdByCard = new Map<string, string>();
  const concepts = [...groups.entries()].map(([key, cards]) => {
    const courseId = courseScope(cards[0]);
    const conceptScopeKey = scopeKey(cards[0]);
    if (cards.some((card) => scopeKey(card) !== conceptScopeKey)) {
      throw new Error(`Concept group ${key} crosses Courses.`);
    }
    if (
      key.startsWith('sequence:') &&
      cards.some((card) => card.back?.trim() !== cards[0].back?.trim())
    ) {
      throw new Error(`Sequence concept group ${key} contains different answers.`);
    }
    const id = conceptIdFor(key);
    cards.forEach((card) => conceptIdByCard.set(card.id, id));
    const common = {
      id,
      scopeKey: conceptScopeKey,
      name: readableName(cards[0]),
      provisional: true as const,
      createdAt: Math.min(...cards.map((card) => card.createdAt)),
      updatedAt: Math.max(...cards.map((card) => card.updatedAt)),
    };
    return courseId === null
      ? ({
          ...common,
          scope: 'legacy-scheduling-unit',
          courseId: null,
          legacySchedulingUnitId: cards[0].schedulingUnitId,
        } satisfies Concept)
      : ({ ...common, scope: 'course', courseId } satisfies Concept);
  });

  const cards: QuestionModeMigrationResult['cards'] = [];
  const questions: FixedQuestionDefinition[] = [];
  const questionConcepts: QuestionConceptSet[] = [];
  const attempts: QuestionAttempt[] = [];
  const removedCardIds: string[] = [];
  const removedReviewHistoryIds: string[] = [];
  const removedLessonCardLinkIds: string[] = [];

  for (const card of sortedCards) {
    const conceptId = conceptIdByCard.get(card.id);
    if (!conceptId) throw new Error(`Card ${card.id} received no Concept.`);
    if (
      !knownQuestionPayload(card.payload) ||
      courseScope(card) === null ||
      input.protectedCardIds?.has(card.id) ||
      typeof card.front !== 'string' ||
      !card.front.trim()
    ) {
      cards.push({ ...card, conceptId });
      continue;
    }

    const courseId = courseScope(card)!;
    const schedule = scheduleOf(card);
    const reviews = reviewsForCard(card, input.reviewHistory);
    const questionId = questionIdFor(card.id);
    const contentRevisionId = `question-content:m24:${encoded(card.id)}:1`;
    const authoringRevisionId = `question-authoring:m24:${encoded(card.id)}:1`;
    const scheduleEpochId = `question-epoch:m24:${encoded(card.id)}:1`;
    const primaryLessonId = card.primaryLessonId ?? null;
    const additionalLessonIds = [
      ...new Set(
        (input.lessonCardLinks ?? [])
          .filter((link) => link.cardId === card.id && link.lessonId !== primaryLessonId)
          .map((link) => link.lessonId),
      ),
    ].sort();
    const baseline =
      card.reps === 0 && reviews.length === 0
        ? ({ kind: 'new' } as const)
        : reviews.length === card.reps
          ? ({
              kind: 'legacy-replayable',
              sourceCardId: card.id,
              sourceReviewIds: reviews.map((review) => review.canonicalId),
            } as const)
          : ({
              kind: 'legacy-opaque',
              sourceCardId: card.id,
              state: schedule,
              reason: reviews.length === 0 ? 'missing-history' : 'inconsistent-history',
            } as const);
    const question: FixedQuestionDefinition = {
      id: questionId,
      courseId,
      primaryLessonId,
      additionalLessonIds,
      kind: 'fixed',
      name: questionName(card),
      prompt: card.front,
      payload: card.payload,
      explanation: legacyExplanation(card, card.payload),
      explanationStatus: 'legacy-derived',
      tags: [...(card.tags ?? [])],
      suspended: card.suspended ?? false,
      contentVersion: 1,
      contentRevisionId,
      authoringRevisionId,
      authoringUpdatedAt: card.updatedAt,
      ...schedule,
      scheduleEpoch: {
        id: scheduleEpochId,
        startedAt: card.createdAt,
        reason: 'legacy-card-migration',
        baseline,
      },
      scheduleUpdatedAt: card.lastReviewed ?? card.createdAt,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
    questions.push(question);
    questionConcepts.push({
      questionId: question.id,
      courseId,
      targetConceptIds: [conceptId],
      prerequisiteConceptIds: [],
      authoringRevisionId,
      authoringUpdatedAt: card.updatedAt,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    });
    reviews.forEach((review, index) => {
      attempts.push(migratedAttempt(question, card.id, review, index));
      removedReviewHistoryIds.push(review.canonicalId);
    });
    removedCardIds.push(card.id);
    removedLessonCardLinkIds.push(
      ...(input.lessonCardLinks ?? [])
        .filter((link) => link.cardId === card.id)
        .map((link) => link.id),
    );
  }

  const referencedConceptIds = new Set([
    ...cards.map((card) => card.conceptId),
    ...questionConcepts.flatMap((set) => set.targetConceptIds),
  ]);
  return {
    cards,
    concepts: concepts.filter((concept) => referencedConceptIds.has(concept.id)),
    questions,
    questionConcepts,
    attempts,
    removedCardIds,
    removedReviewHistoryIds,
    removedLessonCardLinkIds,
  };
}

export function validateQuestionConceptSet(
  set: QuestionConceptSet,
  concepts: Array<Pick<Concept, 'id' | 'courseId'>>,
): void {
  if (!set.questionId.trim() || !set.courseId.trim() || set.targetConceptIds.length !== 1) {
    throw new Error('A Question requires one primary target Concept.');
  }
  const [primaryTargetConceptId] = set.targetConceptIds;
  if (!primaryTargetConceptId?.trim()) {
    throw new Error('A Question requires one primary target Concept.');
  }
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  const target = byId.get(primaryTargetConceptId);
  if (!target || target.courseId !== set.courseId) {
    throw new Error('The primary target Concept must belong to the Question Course.');
  }
  const uniquePrerequisites = new Set(set.prerequisiteConceptIds);
  if (uniquePrerequisites.size !== set.prerequisiteConceptIds.length) {
    throw new Error('A prerequisite Concept cannot be linked twice.');
  }
  if (uniquePrerequisites.has(primaryTargetConceptId)) {
    throw new Error('The primary target cannot also be a prerequisite.');
  }
  for (const conceptId of uniquePrerequisites) {
    const concept = byId.get(conceptId);
    if (!concept || concept.courseId !== set.courseId) {
      throw new Error('Every prerequisite Concept must belong to the Question Course.');
    }
  }
}

export function validateQuestionAttempt(attempt: QuestionAttempt): void {
  if (
    !attempt.id.trim() ||
    !attempt.questionId.trim() ||
    !attempt.courseId.trim() ||
    !attempt.sessionId.trim() ||
    !attempt.renderedPrompt.trim()
  ) {
    throw new Error('Question attempt receipt is incomplete.');
  }
  if (!knownQuestionPayload(attempt.resolvedPayload)) {
    throw new Error('Question attempt payload is unsupported or malformed.');
  }
  const generated = attempt.generatorKey !== undefined;
  if (
    generated &&
    (!attempt.generatorKey?.trim() ||
      !Number.isSafeInteger(attempt.generatorVersion) ||
      !attempt.seed?.trim() ||
      attempt.parameters === undefined ||
      !attempt.generatorFingerprint?.trim())
  ) {
    throw new Error('Generated Question receipts require complete generator evidence.');
  }
  if (
    !generated &&
    (attempt.generatorVersion !== undefined ||
      attempt.seed !== undefined ||
      attempt.parameters !== undefined ||
      attempt.generatorFingerprint !== undefined)
  ) {
    throw new Error('Fixed Question receipts cannot carry partial generator evidence.');
  }
  if (
    attempt.scheduleEffect.kind === 'replay' &&
    (attempt.status !== 'answered' || attempt.grade === undefined)
  ) {
    throw new Error('Only a graded answered attempt can update scheduling.');
  }
}
