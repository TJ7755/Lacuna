import {
  addPart,
  addQuestion,
  addSubpart,
  movePart,
  moveQuestion,
  moveSubpart,
  removePart,
  removeQuestion,
  removeSubpart,
} from './questionSetEditing';
import type {
  QuestionAnswer,
  QuestionPart,
  QuestionSet,
  QuestionSetQuestion,
  QuestionSubpart,
} from './questionSets';

export type QuestionSetAuthoringNode =
  | {
      kind: 'question';
      id: string;
      label: string;
      parentIds: [];
      node: QuestionSetQuestion;
      depth: 0;
    }
  | {
      kind: 'part';
      id: string;
      label: string;
      parentIds: [string];
      node: QuestionPart;
      depth: 1;
    }
  | {
      kind: 'subpart';
      id: string;
      label: string;
      parentIds: [string, string];
      node: QuestionSubpart;
      depth: 2;
    };

function alphabeticLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(97 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return `(${label})`;
}

function romanLabel(index: number): string {
  let value = index + 1;
  const numerals: Array<[number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let label = '';
  for (const [amount, numeral] of numerals) {
    while (value >= amount) {
      label += numeral;
      value -= amount;
    }
  }
  return `(${label})`;
}

export function flattenQuestionSet(set: QuestionSet): QuestionSetAuthoringNode[] {
  return set.questions.flatMap((question, questionIndex): QuestionSetAuthoringNode[] => [
    {
      kind: 'question',
      id: question.id,
      label: `Q${questionIndex + 1}`,
      parentIds: [],
      node: question,
      depth: 0,
    },
    ...question.parts.flatMap((part, partIndex): QuestionSetAuthoringNode[] => [
      {
        kind: 'part',
        id: part.id,
        label: alphabeticLabel(partIndex),
        parentIds: [question.id],
        node: part,
        depth: 1,
      },
      ...part.subparts.map((subpart, subpartIndex): QuestionSetAuthoringNode => ({
        kind: 'subpart',
        id: subpart.id,
        label: romanLabel(subpartIndex),
        parentIds: [question.id, part.id],
        node: subpart,
        depth: 2,
      })),
    ]),
  ]);
}

function updateNode(
  set: QuestionSet,
  nodeId: string,
  update: (
    node: QuestionSetQuestion | QuestionPart | QuestionSubpart,
  ) => QuestionSetQuestion | QuestionPart | QuestionSubpart,
): QuestionSet {
  let found = false;
  const questions = set.questions.map((question) => {
    if (question.id === nodeId) {
      found = true;
      return update(question) as QuestionSetQuestion;
    }
    const parts = question.parts.map((part) => {
      if (part.id === nodeId) {
        found = true;
        return update(part) as QuestionPart;
      }
      const subparts = part.subparts.map((subpart) => {
        if (subpart.id !== nodeId) return subpart;
        found = true;
        return update(subpart) as QuestionSubpart;
      });
      return subparts === part.subparts ? part : { ...part, subparts };
    });
    return parts === question.parts ? question : { ...question, parts };
  });
  if (!found) throw new Error(`Question Set node ${nodeId} was not found.`);
  return { ...set, questions };
}

export function updateQuestionSetNodePrompt(
  set: QuestionSet,
  nodeId: string,
  prompt: string,
): QuestionSet {
  return updateNode(set, nodeId, (node) => ({ ...node, prompt }));
}

export function updateQuestionSetNodeAnswer(
  set: QuestionSet,
  nodeId: string,
  answer: QuestionAnswer | undefined,
): QuestionSet {
  return updateNode(set, nodeId, (node) => ({ ...node, answer }));
}

export interface AddQuestionSetNodeOptions {
  parentIds?: readonly string[];
  id?: string;
  index?: number;
}

export function addQuestionSetNode(
  set: QuestionSet,
  options: AddQuestionSetNodeOptions = {},
): QuestionSet {
  const parents = options.parentIds ?? [];
  if (parents.length === 0) return addQuestion(set, options);
  if (parents.length === 1) return addPart(set, parents[0], options);
  if (parents.length === 2) return addSubpart(set, parents[0], parents[1], options);
  throw new Error('Question Set nodes cannot be nested below subparts.');
}

export function removeQuestionSetNode(set: QuestionSet, nodeId: string): QuestionSet {
  const node = flattenQuestionSet(set).find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Question Set node ${nodeId} was not found.`);
  if (node.kind === 'question') return removeQuestion(set, node.id);
  if (node.kind === 'part') return removePart(set, node.parentIds[0], node.id);
  return removeSubpart(set, node.parentIds[0], node.parentIds[1], node.id);
}

export function moveQuestionSetNode(
  set: QuestionSet,
  nodeId: string,
  toIndex: number,
): QuestionSet {
  const node = flattenQuestionSet(set).find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Question Set node ${nodeId} was not found.`);
  if (node.kind === 'question') return moveQuestion(set, node.id, toIndex);
  if (node.kind === 'part') return movePart(set, node.parentIds[0], node.id, toIndex);
  return moveSubpart(set, node.parentIds[0], node.parentIds[1], node.id, toIndex);
}
