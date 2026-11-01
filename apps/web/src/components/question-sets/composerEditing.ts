import {
  addQuestionSetNode,
  flattenQuestionSet,
  removeQuestionSetNode,
  updateQuestionSetNodeAnswer,
  updateQuestionSetNodePrompt,
  type QuestionSetAuthoringNode,
} from '../../questions/questionSetAuthoring';
import type { QuestionSet } from '../../questions/questionSets';

export function hasChildren(row: QuestionSetAuthoringNode): boolean {
  return (
    ('parts' in row.node && row.node.parts.length > 0) ||
    ('subparts' in row.node && row.node.subparts.length > 0)
  );
}

export function isEmptyRow(row: QuestionSetAuthoringNode): boolean {
  const answer = row.node.answer;
  return (
    !hasChildren(row) &&
    !row.node.prompt.trim() &&
    (!answer ||
      (!answer.allocations.length &&
        !answer.maxMarks &&
        answer.response.kind === 'written' &&
        !answer.prerequisiteConceptIds.length))
  );
}

export function siblings(set: QuestionSet, row: QuestionSetAuthoringNode) {
  return flattenQuestionSet(set).filter(
    (candidate) =>
      candidate.depth === row.depth && candidate.parentIds.at(-1) === row.parentIds.at(-1),
  );
}

export function reparentRow(
  set: QuestionSet,
  row: QuestionSetAuthoringNode,
  parentIds: string[],
  index?: number,
): QuestionSet {
  let next = removeQuestionSetNode(set, row.id);
  next = addQuestionSetNode(next, { id: row.id, parentIds, index });
  next = updateQuestionSetNodePrompt(next, row.id, row.node.prompt);
  return updateQuestionSetNodeAnswer(next, row.id, row.node.answer);
}

export function indentRow(
  set: QuestionSet,
  row: QuestionSetAuthoringNode,
): { content: QuestionSet; moved: boolean } | null {
  const rows = flattenQuestionSet(set);
  const index = rows.findIndex((candidate) => candidate.id === row.id);
  const previous = rows[index - 1];
  if (!isEmptyRow(row) || !previous || row.depth >= 2 || previous.depth < row.depth) return null;
  const depth = row.depth + 1;
  const parent =
    previous.depth === row.depth
      ? previous
      : rows
          .slice(0, index)
          .reverse()
          .find((candidate) => candidate.depth === depth - 1)!;
  let content = reparentRow(set, row, [...parent.parentIds, parent.id]);
  const moved = !hasChildren(parent) && !!parent.node.answer;
  if (moved) {
    content = updateQuestionSetNodeAnswer(content, row.id, parent.node.answer);
    content = updateQuestionSetNodeAnswer(content, parent.id, undefined);
  }
  return { content, moved };
}

export function outdentRow(set: QuestionSet, row: QuestionSetAuthoringNode): QuestionSet | null {
  if (!isEmptyRow(row) || !row.depth) return null;
  const parent = flattenQuestionSet(set).find(
    (candidate) => candidate.id === row.parentIds.at(-1),
  )!;
  const index = siblings(set, parent).findIndex((candidate) => candidate.id === parent.id) + 1;
  return reparentRow(set, row, row.parentIds.slice(0, -1), index);
}
