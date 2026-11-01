import { flattenQuestionSet } from './questionSetAuthoring';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import {
  SCIENCE_EXPLANATION_TECHNIQUES,
  SCIENCE_TECHNIQUES,
} from '@lacuna/core/questions/techniqueTags';

/** Content coverage only: counts neither learner evidence nor transferable mastery. */
export function auditQuestionClassifications(
  sets: readonly QuestionSet[],
  concepts: readonly { id: string; name: string }[],
) {
  const names = new Map(concepts.map((concept) => [concept.id, concept.name]));
  const criteria = sets.flatMap((set) =>
    flattenQuestionSet(set).flatMap((node) =>
      (node.node.answer?.allocations ?? []).map((allocation) => ({
        setId: set.id,
        setTitle: set.title,
        questionId: node.kind === 'question' ? node.id : node.parentIds[0],
        nodeId: node.id,
        allocationId: allocation.id,
        criterion: allocation.criterion,
        dimension: allocation.dimension,
        concepts: allocation.targetConceptIds.map((id) => ({ id, name: names.get(id) ?? null })),
        techniqueTags: allocation.techniqueTags ?? null,
      })),
    ),
  );
  const techniques = [
    { taxonomyId: 'science-explanations', definitions: SCIENCE_EXPLANATION_TECHNIQUES },
    { taxonomyId: 'science-techniques', definitions: SCIENCE_TECHNIQUES },
  ].flatMap(({ taxonomyId, definitions }) =>
    definitions.map((technique) => {
      const matching = criteria.filter(
        (criterion) =>
          criterion.techniqueTags?.taxonomyId === taxonomyId &&
          criterion.techniqueTags.taxonomyVersion === 1 &&
          criterion.techniqueTags.techniqueIds.includes(technique.id),
      );
      return {
        taxonomyId,
        taxonomyVersion: 1,
        techniqueId: technique.id,
        name: technique.name,
        criteria: matching.length,
        questions: new Set(matching.map((row) => JSON.stringify([row.setId, row.questionId]))).size,
      };
    }),
  );
  return {
    totals: {
      concepts: concepts.length,
      sets: sets.length,
      questions: sets.reduce((sum, set) => sum + set.questions.length, 0),
      criteria: criteria.length,
    },
    conceptLinks: {
      unlinked: criteria.filter((row) => row.concepts.length === 0).length,
      single: criteria.filter((row) => row.concepts.length === 1).length,
      combined: criteria.filter((row) => row.concepts.length > 1).length,
      unresolved: criteria.filter((row) => row.concepts.some((concept) => concept.name === null))
        .length,
    },
    techniqueClassifications: {
      unclassified: criteria.filter((row) => row.techniqueTags === null).length,
      explicitNone: criteria.filter((row) => row.techniqueTags?.techniqueIds.length === 0).length,
      tagged: criteria.filter((row) => (row.techniqueTags?.techniqueIds.length ?? 0) > 0).length,
    },
    techniques,
    criteria,
  };
}
