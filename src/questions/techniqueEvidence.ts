import { JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD, type JevDiagnosis } from '../jev/diagnosis';
import type { JevAssessmentReceipt } from '../jev/provenance';
import { answerableNodes, type QuestionSetAttemptRecord } from './questionSetAttempts';
import type { QuestionSetRecord } from './questionSetCodec';
import type { MarkAllocation, QuestionSetQuestion } from './questionSets';
import type { TechniqueId } from './techniqueTags';

export interface ConceptPracticeNeeds {
  knowledge: boolean;
  application: boolean;
  techniques: TechniqueId[];
}

function allocations(question: QuestionSetQuestion): MarkAllocation[] {
  return [
    question.answer,
    ...question.parts.flatMap((part) => [
      part.answer,
      ...part.subparts.map((subpart) => subpart.answer),
    ]),
  ].flatMap((answer) => answer?.allocations ?? []);
}

/** Latest supported observations within a Concept, never a course-wide skill mastery score. */
export function deriveConceptPracticeNeeds(
  attempts: readonly QuestionSetAttemptRecord[],
  sets: readonly QuestionSetRecord[],
): ReadonlyMap<string, ConceptPracticeNeeds> {
  type Category = JevDiagnosis['decisions'][number]['categoryId'];
  const currentSets = new Map(sets.map((set) => [set.id, set]));
  const observations = new Map<string, Map<Category, { gap: boolean; at: number }>>();
  const ordered = [...attempts].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  for (const attempt of ordered) {
    if (
      attempt.undoneAt !== undefined ||
      attempt.status !== 'complete' ||
      currentSets.get(attempt.questionSetId)?.contentRevisionId !==
        attempt.receipt.contentRevisionId
    )
      continue;
    const receipts = new Map<string, JevAssessmentReceipt[]>();
    for (const receipt of attempt.jevAssessmentReceipts ?? []) {
      const existing = receipts.get(receipt.allocationId) ?? [];
      existing.push(receipt);
      receipts.set(receipt.allocationId, existing);
    }
    for (const question of attempt.receipt.questions) {
      if (
        attempt.disputedQuestionIds?.includes(question.id) ||
        attempt.firstMarkingConflicts?.some((snapshot) => snapshot.questionId === question.id)
      )
        continue;
      const nodes = answerableNodes(attempt.receipt).filter(
        (node) => node.questionId === question.id,
      );
      const nodeIds = new Set(nodes.map((node) => node.nodeId));
      for (const allocation of allocations(question)) {
        if (allocation.targetConceptIds.length !== 1) continue;
        const entries = receipts.get(allocation.id);
        // Peer disagreements remain auditable; no winner is invented for selection.
        if (entries?.length !== 1) continue;
        const receipt = entries[0];
        const decision = attempt.decisions.find((row) => row.allocationId === allocation.id);
        if (
          !decision?.markedBy ||
          decision.markedBy.by !== receipt.marking.by ||
          decision.markedBy.model !== receipt.marking.model ||
          decision.markedBy.markedAt !== receipt.marking.markedAt ||
          decision.markedBy.confidence !== receipt.marking.confidence ||
          (decision.status === 'awarded' ? decision.marks : null) !== receipt.mark ||
          attempt.assistance.some(
            (event) => nodeIds.has(event.nodeId) && event.occurredAt <= receipt.marking.markedAt,
          ) ||
          attempt.corrections.some((correction) => nodeIds.has(correction.nodeId))
        )
          continue;
        const conceptId = allocation.targetConceptIds[0];
        const categories = observations.get(conceptId) ?? new Map();
        for (const diagnostic of receipt.diagnosis.decisions) {
          if (
            diagnostic.confidence < JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD ||
            diagnostic.outcome === 'insufficient-evidence'
          )
            continue;
          const previous = categories.get(diagnostic.categoryId);
          const gap = diagnostic.outcome === 'gap';
          if (
            !previous ||
            receipt.marking.markedAt > previous.at ||
            (receipt.marking.markedAt === previous.at && gap)
          ) {
            categories.set(diagnostic.categoryId, { gap, at: receipt.marking.markedAt });
          }
        }
        observations.set(conceptId, categories);
      }
    }
  }
  return new Map(
    [...observations].map(([conceptId, categories]) => [
      conceptId,
      {
        knowledge: categories.get('knowledge')?.gap === true,
        application: categories.get('application')?.gap === true,
        techniques: [...categories].flatMap(([category, observation]) =>
          category !== 'knowledge' && category !== 'application' && observation.gap
            ? [category]
            : [],
        ),
      },
    ]),
  );
}

/** Order comparable fresh Questions using separately attributable knowledge and technique needs. */
export function questionGapPriority(
  question: QuestionSetQuestion,
  needs: ReadonlyMap<string, ConceptPracticeNeeds>,
): number {
  let knowledge = false;
  let technique = false;
  let application = false;
  for (const allocation of allocations(question)) {
    if (allocation.targetConceptIds.length !== 1) continue;
    const need = needs.get(allocation.targetConceptIds[0]);
    if (!need) continue;
    knowledge ||= need.knowledge;
    application ||= need.application;
    technique ||=
      allocation.techniqueTags?.techniqueIds.some((id) => need.techniques.includes(id)) === true;
  }
  // Both gaps, then prerequisite knowledge, then a matching technique, then application.
  return knowledge ? (technique ? 4 : 3) : technique ? 2 : application ? 1 : 0;
}
