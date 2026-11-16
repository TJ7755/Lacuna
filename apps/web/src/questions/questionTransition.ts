import type { Tombstone } from '@lacuna/core/db/types';
import type {
  QuestionConceptSet,
  QuestionDefinition,
  QuestionPayload,
  ResolvedQuestionInstance,
} from '@lacuna/core/questions/types';
import {
  parseQuestionSetRecord,
  type QuestionSetRecord,
} from '@lacuna/core/questions/questionSetCodec';
import type { QuestionSetQuestion } from '@lacuna/core/questions/questionSets';
import { serialiseMarkScheme } from '../items/markSchemeCompiler';
import { questionGeneratorRegistry } from './generators';

export function transitionedSetId(questionId: string): string {
  return `question-set:individual:${encodeURIComponent(questionId)}`;
}

function criteria(payload: QuestionPayload): Array<{ criterion: string; maxMarks: number }> {
  if (payload.kind === 'working')
    return payload.scheme.map((line) => ({
      criterion: serialiseMarkScheme([line]),
      maxMarks: line.marks,
    }));
  const answer = payload.answer;
  return [
    {
      criterion:
        answer.kind === 'matches-one-of'
          ? `Answer: ${answer.values.join(' or ')}.`
          : `Answer: ${answer.value}${answer.kind === 'within' ? ` within ${answer.tolerance}` : ''}.`,
      maxMarks: 1,
    },
  ];
}

/** The source payload and fixtures remain intact; this is its self-marking presentation. */
export function transitionedQuestion(
  id: string,
  instance: ResolvedQuestionInstance,
  links: Pick<QuestionConceptSet, 'targetConceptIds' | 'prerequisiteConceptIds'>,
): QuestionSetQuestion {
  const allocations = criteria(instance.resolvedPayload).map((point, index) => ({
    ...point,
    id: `${id}:mark:${index}`,
    dimension: 'application' as const,
    targetConceptIds: [...links.targetConceptIds],
    ...(index === 0 ? { explanation: instance.renderedExplanation } : {}),
  }));
  return {
    id,
    prompt: instance.renderedPrompt,
    parts: [],
    answer: {
      maxMarks: allocations.reduce((sum, point) => sum + point.maxMarks, 0),
      response: { kind: instance.resolvedPayload.kind === 'numeric' ? 'calculation' : 'written' },
      allocations,
      prerequisiteConceptIds: [...links.prerequisiteConceptIds],
    },
  };
}

export function resolveTransitionSource(
  source: QuestionDefinition,
  seed: string,
): ResolvedQuestionInstance {
  return source.kind === 'fixed'
    ? {
        renderedPrompt: source.prompt,
        resolvedPayload: source.payload,
        renderedExplanation: source.explanation,
      }
    : questionGeneratorRegistry.resolve({
        generatorKey: source.generatorKey,
        generatorVersion: source.generatorVersion,
        configuration: source.generatorConfig,
        seed,
      });
}

/**
 * Additive and deterministic: never rewrite attempts or source schedules. Existing
 * sets refresh only when their owning authoring operation explicitly requests it.
 * The source receipt prevents a deleted set being recreated after tombstone expiry.
 * Unknown generators remain recoverable source records rather than blocking database opening.
 */
export function transitionIndividualQuestions(
  questions: readonly QuestionDefinition[],
  links: readonly QuestionConceptSet[],
  sets: readonly QuestionSetRecord[],
  tombstones: readonly Tombstone[] = [],
  refresh: boolean | ReadonlySet<string> = false,
): { questions: QuestionDefinition[]; questionSets: QuestionSetRecord[] } {
  const byQuestion = new Map(links.map((row) => [row.questionId, row]));
  const result = new Map(sets.map((row) => [row.id, row]));
  const deleted = new Set(
    tombstones.filter((row) => row.table === 'questionSets').map((row) => row.recordId),
  );
  const sources = questions.map((source) => {
    const id =
      source.migratedToSetId ??
      sets.find((set) => set.legacyQuestionId === source.id)?.id ??
      transitionedSetId(source.id);
    if (source.migratedToSetId && !result.has(id)) return source;
    if (deleted.has(id)) return { ...source, migratedToSetId: id };
    const relationship = byQuestion.get(source.id);
    if (!relationship || relationship.courseId !== source.courseId) return source;
    const existing = result.get(id);
    if (
      !existing ||
      ((refresh === true || (refresh !== false && refresh.has(source.id))) &&
        existing.legacyQuestionId === source.id &&
        existing.contentRevisionId !== `individual:${source.authoringRevisionId}`)
    ) {
      try {
        result.set(
          id,
          parseQuestionSetRecord({
            id,
            legacyQuestionId: source.id,
            courseId: source.courseId,
            title: source.name,
            lessonIds: [
              ...new Set([
                ...(source.primaryLessonId ? [source.primaryLessonId] : []),
                ...source.additionalLessonIds,
              ]),
            ],
            assessmentIds: existing?.assessmentIds ?? [],
            questions: [
              transitionedQuestion(
                existing?.questions[0]?.id ?? source.id,
                resolveTransitionSource(source, `transition:${source.contentRevisionId}`),
                relationship,
              ),
            ],
            contentVersion: existing ? existing.contentVersion + 1 : 1,
            contentRevisionId: `individual:${source.authoringRevisionId}`,
            createdAt: existing?.createdAt ?? source.createdAt,
            updatedAt: Math.max(
              source.createdAt,
              source.authoringUpdatedAt,
              existing ? existing.updatedAt + 1 : 0,
            ),
          }),
        );
      } catch {
        return source;
      }
    } else if (result.get(id)?.legacyQuestionId !== source.id) {
      throw new Error(`Question migration destination ${id} belongs to different content.`);
    }
    return { ...source, migratedToSetId: id };
  });
  return { questions: sources, questionSets: [...result.values()] };
}
