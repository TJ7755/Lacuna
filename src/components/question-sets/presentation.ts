import type {
  QuestionAnswer,
  QuestionSetIssue,
  QuestionSetIssueCode,
  QuestionSet,
  QuestionSetQuestion,
  QuestionPart,
  QuestionSubpart,
} from '../../questions/questionSets';
export type PaperNode = QuestionSetQuestion | QuestionPart | QuestionSubpart;
export function questionSetMarks(set: QuestionSet): number {
  return set.questions.reduce((total, q) => total + nodeMarks(q), 0);
}
export function nodeMarks(node: PaperNode): number {
  const children = 'parts' in node ? node.parts : 'subparts' in node ? node.subparts : [];
  return children.length
    ? children.reduce((sum, child) => sum + nodeMarks(child), 0)
    : (node.answer?.maxMarks ?? 0);
}
export function emptyAnswer(): QuestionAnswer {
  return {
    maxMarks: 1,
    response: { kind: 'written' },
    allocations: [],
    prerequisiteConceptIds: [],
  };
}
export const dimensionNames = {
  knowledge: 'Knowledge',
  application: 'Application / reasoning',
  'exam-execution': 'Exam technique',
  mixed: 'Mixed',
};

export function issueMessage(set: QuestionSet, issue: QuestionSetIssue): string {
  const messages: Record<QuestionSetIssueCode, string> = {
    'missing-identity': 'A link is incomplete.',
    'missing-title': 'Give this set a title.',
    'missing-prompt': 'Write the question or shared source.',
    'missing-answer': 'Add an answer format and complete the marking criteria.',
    'duplicate-id': 'Some content or links are duplicated.',
    'scored-parent': 'Shared source cannot also carry its own marks.',
    'invalid-depth': 'Use questions, parts and subparts only.',
    'invalid-marks': 'Marks must be positive whole numbers.',
    'allocation-total-mismatch': 'The criteria must add up to the part’s total marks.',
    'invalid-dimension': 'Choose what the criterion assesses.',
    'invalid-options': 'Add at least two options and choose the correct answer or answers.',
  };
  const indices = [...issue.path.matchAll(/(?:questions|parts|subparts)\[(\d+)\]/g)].map((match) =>
    Number(match[1]),
  );
  const q = set.questions[indices[0]];
  const prefix = q
    ? `Question ${indices[0] + 1}${indices.length > 1 ? `, part ${indices[1] + 1}` : ''}${indices.length > 2 ? `, subpart ${indices[2] + 1}` : ''}: `
    : '';
  return prefix + messages[issue.code];
}
