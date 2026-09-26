import type { QuestionSetRecord } from './questionSetCodec';
import type { QuestionSetAttemptRecord } from './questionSetAttempts';
import type { AssessmentDimension, QuestionAnswer } from './questionSets';

export interface EvidenceMarks {
  earned: number;
  /** Maximum marks represented by submitted original responses. */
  available: number;
  /** Submitted marks which remain unsure or unmarked. */
  unresolvedAvailable: number;
}

export interface QuestionSetEvidencePartition {
  attempts: number;
  completed: number;
  provisional: number;
  answering: number;
  assisted: number;
  marks: EvidenceMarks;
  dimensions: Record<AssessmentDimension, EvidenceMarks>;
}

export interface QuestionSetEvidenceBySet {
  questionSetId: string;
  /** Null when only retained attempt receipts remain. */
  title: string | null;
  all: QuestionSetEvidencePartition;
  firstRecorded: QuestionSetEvidencePartition;
  repeated: QuestionSetEvidencePartition;
}

export interface QuestionSetEvidenceSummary {
  coverage: {
    targetConceptIds: string[];
    prerequisiteConceptIds: string[];
  };
  sets: QuestionSetEvidenceBySet[];
}

const DIMENSIONS: readonly AssessmentDimension[] = [
  'knowledge',
  'application',
  'exam-execution',
  'mixed',
];

function emptyMarks(): EvidenceMarks {
  return { earned: 0, available: 0, unresolvedAvailable: 0 };
}

function emptyPartition(): QuestionSetEvidencePartition {
  return {
    attempts: 0,
    completed: 0,
    provisional: 0,
    answering: 0,
    assisted: 0,
    marks: emptyMarks(),
    dimensions: Object.fromEntries(
      DIMENSIONS.map((dimension) => [dimension, emptyMarks()]),
    ) as Record<AssessmentDimension, EvidenceMarks>,
  };
}

function answersIn(set: QuestionSetRecord): Array<{ nodeId: string; answer: QuestionAnswer }> {
  return set.questions.flatMap((question) => {
    const answers: Array<{ nodeId: string; answer: QuestionAnswer }> = [];
    if (question.answer) answers.push({ nodeId: question.id, answer: question.answer });
    for (const part of question.parts) {
      if (part.answer) answers.push({ nodeId: part.id, answer: part.answer });
      for (const subpart of part.subparts) {
        if (subpart.answer) answers.push({ nodeId: subpart.id, answer: subpart.answer });
      }
    }
    return answers;
  });
}

function addAttempt(partition: QuestionSetEvidencePartition, attempt: QuestionSetAttemptRecord) {
  partition.attempts++;
  partition[
    attempt.status === 'complete'
      ? 'completed'
      : attempt.status === 'marking'
        ? 'provisional'
        : 'answering'
  ]++;
  if (attempt.assistance.length > 0) partition.assisted++;
  const submittedNodeIds = new Set(
    attempt.responses.filter((response) => response.submitted).map((response) => response.nodeId),
  );
  const decisions = new Map(attempt.decisions.map((decision) => [decision.allocationId, decision]));
  for (const { nodeId, answer } of answersIn(attempt.receipt)) {
    if (!submittedNodeIds.has(nodeId)) continue;
    for (const allocation of answer.allocations) {
      const dimension = partition.dimensions[allocation.dimension];
      partition.marks.available += allocation.maxMarks;
      dimension.available += allocation.maxMarks;
      const decision = decisions.get(allocation.id);
      if (decision?.status === 'awarded') {
        partition.marks.earned += decision.marks;
        dimension.earned += decision.marks;
      } else {
        partition.marks.unresolvedAvailable += allocation.maxMarks;
        dimension.unresolvedAvailable += allocation.maxMarks;
      }
    }
  }
}

function addCoverage(set: QuestionSetRecord, targets: Set<string>, prerequisites: Set<string>) {
  for (const { answer } of answersIn(set)) {
    answer.prerequisiteConceptIds.forEach((id) => prerequisites.add(id));
    answer.allocations.forEach((allocation) =>
      allocation.targetConceptIds.forEach((id) => targets.add(id)),
    );
  }
}

/** Pure descriptive evidence. It never projects marks into Card scheduling state. */
export function summariseQuestionSetEvidence(input: {
  courseId: string;
  currentSets: readonly QuestionSetRecord[];
  attempts: readonly QuestionSetAttemptRecord[];
}): QuestionSetEvidenceSummary {
  const currentSets = input.currentSets.filter((set) => set.courseId === input.courseId);
  const attempts = input.attempts.filter((attempt) => attempt.courseId === input.courseId);
  const targets = new Set<string>();
  const prerequisites = new Set<string>();
  currentSets.forEach((set) => addCoverage(set, targets, prerequisites));

  const currentById = new Map(currentSets.map((set) => [set.id, set]));
  const ids = new Set([...currentById.keys(), ...attempts.map((attempt) => attempt.questionSetId)]);
  const sets = [...ids]
    .sort((left, right) => {
      const leftCreated = currentById.get(left)?.createdAt ?? Number.MAX_SAFE_INTEGER;
      const rightCreated = currentById.get(right)?.createdAt ?? Number.MAX_SAFE_INTEGER;
      return leftCreated - rightCreated || left.localeCompare(right);
    })
    .map((questionSetId): QuestionSetEvidenceBySet => {
      const rows = attempts
        .filter((attempt) => attempt.questionSetId === questionSetId)
        .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
      const result: QuestionSetEvidenceBySet = {
        questionSetId,
        title: currentById.get(questionSetId)?.title ?? null,
        all: emptyPartition(),
        firstRecorded: emptyPartition(),
        repeated: emptyPartition(),
      };
      rows.forEach((attempt, index) => {
        addAttempt(result.all, attempt);
        addAttempt(index === 0 ? result.firstRecorded : result.repeated, attempt);
      });
      return result;
    });
  return {
    coverage: {
      targetConceptIds: [...targets].sort(),
      prerequisiteConceptIds: [...prerequisites].sort(),
    },
    sets,
  };
}
