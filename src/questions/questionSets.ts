/** Ordered, shareable question content. Markdown source includes images and maths. */
export interface QuestionSet {
  id: string;
  courseId: string;
  title: string;
  lessonIds: string[];
  assessmentIds: string[];
  questions: QuestionSetQuestion[];
}

export interface QuestionSetQuestion {
  id: string;
  prompt: string;
  answer?: QuestionAnswer;
  parts: QuestionPart[];
}

export interface QuestionPart {
  id: string;
  prompt: string;
  answer?: QuestionAnswer;
  subparts: QuestionSubpart[];
}

export interface QuestionSubpart {
  id: string;
  prompt: string;
  answer?: QuestionAnswer;
}

export type QuestionResponse =
  | { kind: 'written' }
  | { kind: 'calculation' }
  | {
      kind: 'multiple-choice';
      selection: 'single' | 'multiple';
      options: Array<{ id: string; content: string }>;
      correctOptionIds: string[];
    };

export type AssessmentDimension = 'knowledge' | 'application' | 'exam-execution' | 'mixed';

export interface MarkAllocation {
  id: string;
  criterion: string;
  /** Optional Markdown detail, such as alternatives or a level descriptor. */
  explanation?: string;
  maxMarks: number;
  dimension: AssessmentDimension;
  /** Existing Concept identities; multiple links do not multiply this allocation's marks. */
  targetConceptIds: string[];
}

export interface QuestionAnswer {
  maxMarks: number;
  response: QuestionResponse;
  allocations: MarkAllocation[];
  prerequisiteConceptIds: string[];
}

export type QuestionSetIssueCode =
  | 'missing-identity'
  | 'missing-title'
  | 'missing-prompt'
  | 'missing-answer'
  | 'duplicate-id'
  | 'scored-parent'
  | 'invalid-depth'
  | 'invalid-marks'
  | 'allocation-total-mismatch'
  | 'invalid-dimension'
  | 'invalid-options';

export interface QuestionSetIssue {
  code: QuestionSetIssueCode;
  path: string;
}

const DIMENSIONS: readonly AssessmentDimension[] = [
  'knowledge',
  'application',
  'exam-execution',
  'mixed',
];

function validMaximum(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Validates a typed, complete set for practice or sharing. Parse untrusted JSON before
 * calling this; it does not check that arrays and strings have the right runtime types.
 * Incomplete author drafts may be saved separately.
 */
export function validateQuestionSet(set: QuestionSet): QuestionSetIssue[] {
  const issues: QuestionSetIssue[] = [];
  const ids = new Set<string>();
  let setTotal = 0;
  const issue = (code: QuestionSetIssueCode, path: string) => issues.push({ code, path });
  const checkId = (id: string, path: string) => {
    if (!id.trim()) issue('missing-identity', path);
    else if (ids.has(id)) issue('duplicate-id', path);
    else ids.add(id);
  };
  const checkLinks = (links: string[], path: string) => {
    const seen = new Set<string>();
    links.forEach((id, index) => {
      if (!id.trim()) issue('missing-identity', `${path}[${index}]`);
      else if (seen.has(id)) issue('duplicate-id', `${path}[${index}]`);
      else seen.add(id);
    });
  };
  const checkAnswer = (answer: QuestionAnswer, path: string) => {
    if (!validMaximum(answer.maxMarks)) issue('invalid-marks', `${path}.maxMarks`);
    else setTotal += answer.maxMarks;
    if (answer.allocations.length === 0) issue('missing-answer', `${path}.allocations`);
    checkLinks(answer.prerequisiteConceptIds, `${path}.prerequisiteConceptIds`);

    let allocationTotal = 0;
    let validAllocations = true;
    answer.allocations.forEach((allocation, index) => {
      const allocationPath = `${path}.allocations[${index}]`;
      checkId(allocation.id, `${allocationPath}.id`);
      if (!allocation.criterion.trim()) issue('missing-answer', `${allocationPath}.criterion`);
      if (!validMaximum(allocation.maxMarks)) {
        issue('invalid-marks', `${allocationPath}.maxMarks`);
        validAllocations = false;
      } else {
        allocationTotal += allocation.maxMarks;
      }
      if (!DIMENSIONS.includes(allocation.dimension)) {
        issue('invalid-dimension', `${allocationPath}.dimension`);
      }
      checkLinks(allocation.targetConceptIds, `${allocationPath}.targetConceptIds`);
    });
    if (validAllocations && !Number.isSafeInteger(allocationTotal)) {
      issue('invalid-marks', `${path}.allocations`);
    } else if (
      validMaximum(answer.maxMarks) &&
      validAllocations &&
      allocationTotal !== answer.maxMarks
    ) {
      issue('allocation-total-mismatch', path);
    }

    const response = answer.response;
    if (response.kind === 'multiple-choice') {
      if (response.options.length < 2) issue('invalid-options', `${path}.response.options`);
      const optionIds = new Set<string>();
      response.options.forEach((option, index) => {
        const optionPath = `${path}.response.options[${index}]`;
        checkId(option.id, `${optionPath}.id`);
        optionIds.add(option.id);
        if (!option.content.trim()) issue('invalid-options', `${optionPath}.content`);
      });
      const correctIds = new Set(response.correctOptionIds);
      if (
        (response.selection !== 'single' && response.selection !== 'multiple') ||
        correctIds.size !== response.correctOptionIds.length ||
        correctIds.size === 0 ||
        (response.selection === 'single' && correctIds.size !== 1) ||
        [...correctIds].some((id) => !optionIds.has(id))
      ) {
        issue('invalid-options', `${path}.response.correctOptionIds`);
      }
    } else if (response.kind !== 'written' && response.kind !== 'calculation') {
      issue('missing-answer', `${path}.response`);
    }
  };

  checkId(set.id, 'id');
  if (!set.courseId.trim()) issue('missing-identity', 'courseId');
  if (!set.title.trim()) issue('missing-title', 'title');
  checkLinks(set.lessonIds, 'lessonIds');
  checkLinks(set.assessmentIds, 'assessmentIds');
  if (set.questions.length === 0) issue('missing-answer', 'questions');

  set.questions.forEach((question, questionIndex) => {
    const questionPath = `questions[${questionIndex}]`;
    if ('subparts' in question) issue('invalid-depth', questionPath);
    checkId(question.id, `${questionPath}.id`);
    if (!question.prompt.trim()) issue('missing-prompt', `${questionPath}.prompt`);
    if (question.answer) checkAnswer(question.answer, `${questionPath}.answer`);
    if (question.answer && question.parts.length) issue('scored-parent', questionPath);
    let hasAnswer = !!question.answer;

    question.parts.forEach((part, partIndex) => {
      const partPath = `${questionPath}.parts[${partIndex}]`;
      if ('parts' in part) issue('invalid-depth', partPath);
      checkId(part.id, `${partPath}.id`);
      if (!part.prompt.trim()) issue('missing-prompt', `${partPath}.prompt`);
      if (part.answer) checkAnswer(part.answer, `${partPath}.answer`);
      if (part.answer && part.subparts.length) issue('scored-parent', partPath);
      hasAnswer ||= !!part.answer;

      part.subparts.forEach((subpart, subpartIndex) => {
        const subpartPath = `${partPath}.subparts[${subpartIndex}]`;
        checkId(subpart.id, `${subpartPath}.id`);
        if (!subpart.prompt.trim()) issue('missing-prompt', `${subpartPath}.prompt`);
        if (subpart.answer) checkAnswer(subpart.answer, `${subpartPath}.answer`);
        hasAnswer ||= !!subpart.answer;
        if ('parts' in subpart || 'subparts' in subpart) issue('invalid-depth', subpartPath);
      });
    });
    if (!hasAnswer) issue('missing-answer', questionPath);
  });
  if (!Number.isSafeInteger(setTotal)) issue('invalid-marks', 'questions');
  return issues;
}

export type SelfMarkDecision =
  | { allocationId: string; status: 'awarded'; marks: number }
  | { allocationId: string; status: 'unsure' };

export interface MarkTotal {
  awarded: number;
  available: number;
}

export interface SelfMarkSummary {
  status: 'provisional' | 'complete';
  total: MarkTotal;
  dimensions: Record<AssessmentDimension, MarkTotal>;
  resolvedCount: number;
  unsureCount: number;
  unmarkedCount: number;
}

function allocationsIn(set: QuestionSet): MarkAllocation[] {
  return set.questions.flatMap((question) => [
    ...(question.answer?.allocations ?? []),
    ...question.parts.flatMap((part) => [
      ...(part.answer?.allocations ?? []),
      ...part.subparts.flatMap((subpart) => subpart.answer?.allocations ?? []),
    ]),
  ]);
}

/** Sum each criterion once. Missing decisions and unsure decisions keep the result provisional. */
export function summariseSelfMarking(
  set: QuestionSet,
  decisions: readonly SelfMarkDecision[],
): SelfMarkSummary {
  const issues = validateQuestionSet(set);
  if (issues.length)
    throw new Error(`Invalid question set: ${issues[0].code} at ${issues[0].path}`);

  const allocations = allocationsIn(set);
  const byId = new Map(allocations.map((allocation) => [allocation.id, allocation]));
  const byDecision = new Map<string, SelfMarkDecision>();
  for (const decision of decisions) {
    const allocation = byId.get(decision.allocationId);
    if (!allocation) throw new Error(`Unknown allocation: ${decision.allocationId}`);
    if (byDecision.has(decision.allocationId)) {
      throw new Error(`Duplicate decision: ${decision.allocationId}`);
    }
    if (
      (decision.status !== 'awarded' && decision.status !== 'unsure') ||
      (decision.status === 'awarded' &&
        (!Number.isSafeInteger(decision.marks) ||
          decision.marks < 0 ||
          decision.marks > allocation.maxMarks))
    ) {
      throw new Error(`Invalid award: ${decision.allocationId}`);
    }
    byDecision.set(decision.allocationId, decision);
  }

  const dimensions = Object.fromEntries(
    DIMENSIONS.map((dimension) => [dimension, { awarded: 0, available: 0 }]),
  ) as Record<AssessmentDimension, MarkTotal>;
  const total = { awarded: 0, available: 0 };
  let resolvedCount = 0;
  let unsureCount = 0;
  let unmarkedCount = 0;
  for (const allocation of allocations) {
    total.available += allocation.maxMarks;
    const dimension = dimensions[allocation.dimension];
    dimension.available += allocation.maxMarks;
    const decision = byDecision.get(allocation.id);
    if (!decision) unmarkedCount++;
    else if (decision.status === 'unsure') unsureCount++;
    else {
      resolvedCount++;
      total.awarded += decision.marks;
      dimension.awarded += decision.marks;
    }
  }
  return {
    status: unsureCount || unmarkedCount ? 'provisional' : 'complete',
    total,
    dimensions,
    resolvedCount,
    unsureCount,
    unmarkedCount,
  };
}
