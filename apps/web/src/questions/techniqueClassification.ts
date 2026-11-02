import type { MarkAllocation, QuestionSet } from '@lacuna/core/questions/questionSets';
import {
  activeTechniqueIds,
  classifiedTechniqueTags,
  isManualTechniqueDecision,
  suggestedTechniqueIds,
  type CourseTechnique,
} from '@lacuna/core/questions/techniqueTags';
import {
  JEV_BATCH_REQUEST_BYTE_LIMIT,
  JEV_CLASSIFY_MAX_POINTS,
  JEV_CLASSIFY_MAX_QUESTIONS,
  JEV_TEXT_MAX,
  type JevClassifyPoint,
  type JevTechniqueClassificationRequest,
} from '../jev/protocol';
import { flattenQuestionSet, updateQuestionSetNodeAnswer } from './questionSetAuthoring';

export interface ClassificationTarget {
  nodeId: string;
  pointId: string;
  point: JevClassifyPoint;
}

/**
 * Every point Jev may classify: each criterion not already decided by the author. A part's
 * prompt carries its parents' prompts, since a part often makes sense only with its stem.
 * Over-long context is clipped from the start, keeping the text nearest the criterion; a
 * criterion over the request limit is skipped, since results are matched by its exact text.
 */
export function classificationTargets(set: QuestionSet): ClassificationTarget[] {
  const rows = flattenQuestionSet(set);
  const targets: ClassificationTarget[] = [];
  for (const row of rows) {
    const answer = row.node.answer;
    if (!answer) continue;
    const prompt = [
      ...row.parentIds.map((id) => rows.find((candidate) => candidate.id === id)?.node.prompt),
      row.node.prompt,
    ]
      .map((text) => text?.trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(-JEV_TEXT_MAX);
    for (const allocation of answer.allocations) {
      if (
        isManualTechniqueDecision(allocation.techniqueTags) ||
        !allocation.criterion.trim() ||
        allocation.criterion.length > JEV_TEXT_MAX
      )
        continue;
      targets.push({
        nodeId: row.id,
        pointId: allocation.id,
        point: {
          prompt: prompt || allocation.criterion,
          criterion: allocation.criterion,
          explanation: (allocation.explanation ?? '').slice(0, JEV_TEXT_MAX),
          maxMarks: allocation.maxMarks,
        },
      });
    }
  }
  return targets;
}

export function classificationTechniques(
  catalogue: readonly CourseTechnique[],
): JevTechniqueClassificationRequest['techniques'] {
  return catalogue
    .filter((technique) => !technique.archived)
    .map(({ id, name, description, example }) => ({
      id,
      name,
      ...(description ? { description } : {}),
      ...(example ? { example } : {}),
    }));
}

/** Split targets into requests that each stay within the question and byte limits. */
export function classificationRequests(
  targets: readonly ClassificationTarget[],
  techniques: JevTechniqueClassificationRequest['techniques'],
): ClassificationTarget[][] {
  if (!techniques.length) return [];
  const perRequest = Math.max(
    1,
    Math.min(JEV_CLASSIFY_MAX_POINTS, Math.floor(JEV_CLASSIFY_MAX_QUESTIONS / techniques.length)),
  );
  const encoder = new TextEncoder();
  const base = encoder.encode(
    JSON.stringify({ purpose: 'technique-classification', techniques, points: [] }),
  ).length;
  const budget = JEV_BATCH_REQUEST_BYTE_LIMIT;
  const chunks: ClassificationTarget[][] = [];
  let current: ClassificationTarget[] = [];
  let bytes = base;
  for (const target of targets) {
    const size = encoder.encode(JSON.stringify(target.point)).length + 1;
    if (current.length && (current.length >= perRequest || bytes + size > budget)) {
      chunks.push(current);
      current = [];
      bytes = base;
    }
    current.push(target);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export interface ClassificationOutcome {
  target: ClassificationTarget;
  techniqueIds: readonly string[];
  suggestedIds: readonly string[];
}

/**
 * Apply Jev's results to the current draft. A point the author has since decided, deleted or
 * reworded is skipped, so a result never lands on a criterion Jev did not read.
 */
export function applyClassification(
  set: QuestionSet,
  outcomes: readonly ClassificationOutcome[],
  model: string,
): { content: QuestionSet; applied: string[] } {
  let content = set;
  const applied: string[] = [];
  const byNode = new Map<string, ClassificationOutcome[]>();
  for (const outcome of outcomes)
    byNode.set(outcome.target.nodeId, [...(byNode.get(outcome.target.nodeId) ?? []), outcome]);
  for (const [nodeId, rows] of byNode) {
    const answer = flattenQuestionSet(content).find((row) => row.id === nodeId)?.node.answer;
    if (!answer) continue;
    const allocations = answer.allocations.map((allocation) => {
      const outcome = rows.find((row) => row.target.pointId === allocation.id);
      if (
        !outcome ||
        allocation.criterion !== outcome.target.point.criterion ||
        isManualTechniqueDecision(allocation.techniqueTags)
      )
        return allocation;
      applied.push(allocation.id);
      const techniqueTags = classifiedTechniqueTags(allocation.techniqueTags, outcome, model);
      const { techniqueTags: _previous, ...rest } = allocation;
      return techniqueTags ? { ...rest, techniqueTags } : rest;
    });
    content = updateQuestionSetNodeAnswer(content, nodeId, { ...answer, allocations });
  }
  return { content, applied };
}

export interface ClassificationSummary {
  classified: number;
  /** Points with at least one technique that counts. */
  tagged: number;
  /** Points with a suggestion waiting for the author. */
  unsure: number;
  /** Tagged points whose Knowledge dimension stops their techniques counting. */
  knowledge: number;
}

function points(set: QuestionSet, ids: ReadonlySet<string>): MarkAllocation[] {
  return flattenQuestionSet(set).flatMap((row) =>
    (row.node.answer?.allocations ?? []).filter((allocation) => ids.has(allocation.id)),
  );
}

/** Summarise the classified points as they stand now, after any edits since. */
export function classificationSummary(
  set: QuestionSet,
  ids: ReadonlySet<string>,
): ClassificationSummary {
  const rows = points(set, ids);
  return {
    classified: rows.length,
    tagged: rows.filter((row) => activeTechniqueIds(row.techniqueTags).length).length,
    unsure: rows.filter((row) => suggestedTechniqueIds(row.techniqueTags).length).length,
    knowledge: rows.filter(
      (row) => row.dimension === 'knowledge' && activeTechniqueIds(row.techniqueTags).length,
    ).length,
  };
}

/** The one-click fix: tagged Knowledge points among `ids` now count as exam technique. */
export function countTaggedKnowledgeAsExamTechnique(
  set: QuestionSet,
  ids: ReadonlySet<string>,
): QuestionSet {
  let content = set;
  for (const row of flattenQuestionSet(set)) {
    const answer = row.node.answer;
    if (
      !answer?.allocations.some(
        (allocation) =>
          ids.has(allocation.id) &&
          allocation.dimension === 'knowledge' &&
          activeTechniqueIds(allocation.techniqueTags).length,
      )
    )
      continue;
    content = updateQuestionSetNodeAnswer(content, row.id, {
      ...answer,
      allocations: answer.allocations.map((allocation) =>
        ids.has(allocation.id) &&
        allocation.dimension === 'knowledge' &&
        activeTechniqueIds(allocation.techniqueTags).length
          ? { ...allocation, dimension: 'exam-execution' }
          : allocation,
      ),
    });
  }
  return content;
}
