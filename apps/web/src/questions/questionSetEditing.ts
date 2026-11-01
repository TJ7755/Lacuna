import { makeId } from '../utils/id';
import type {
  QuestionPart,
  QuestionSet,
  QuestionSetQuestion,
  QuestionSubpart,
} from './questionSets';

type Identified = { id: string };

function insert<T>(items: readonly T[], item: T, index = items.length): T[] {
  if (!Number.isInteger(index) || index < 0 || index > items.length)
    throw new Error('Invalid insertion index.');
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function remove<T extends Identified>(items: readonly T[], id: string): T[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`Item ${id} was not found.`);
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

function move<T extends Identified>(items: readonly T[], id: string, toIndex: number): T[] {
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= items.length)
    throw new Error('Invalid target index.');
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) throw new Error(`Item ${id} was not found.`);
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function updateQuestion(
  set: QuestionSet,
  questionId: string,
  update: (question: QuestionSetQuestion) => QuestionSetQuestion,
): QuestionSet {
  const index = set.questions.findIndex((question) => question.id === questionId);
  if (index < 0) throw new Error(`Question ${questionId} was not found.`);
  const questions = [...set.questions];
  questions[index] = update(questions[index]);
  return { ...set, questions };
}

function updatePart(
  question: QuestionSetQuestion,
  partId: string,
  update: (part: QuestionPart) => QuestionPart,
): QuestionSetQuestion {
  const index = question.parts.findIndex((part) => part.id === partId);
  if (index < 0) throw new Error(`Part ${partId} was not found.`);
  const parts = [...question.parts];
  parts[index] = update(parts[index]);
  return { ...question, parts };
}

export function addQuestion(
  set: QuestionSet,
  options: { id?: string; index?: number } = {},
): QuestionSet {
  const question: QuestionSetQuestion = { id: options.id ?? makeId(), prompt: '', parts: [] };
  return { ...set, questions: insert(set.questions, question, options.index) };
}

export function removeQuestion(set: QuestionSet, questionId: string): QuestionSet {
  return { ...set, questions: remove(set.questions, questionId) };
}

export function moveQuestion(set: QuestionSet, questionId: string, toIndex: number): QuestionSet {
  return { ...set, questions: move(set.questions, questionId, toIndex) };
}

export function addPart(
  set: QuestionSet,
  questionId: string,
  options: { id?: string; index?: number } = {},
): QuestionSet {
  const part: QuestionPart = { id: options.id ?? makeId(), prompt: '', subparts: [] };
  return updateQuestion(set, questionId, (question) => ({
    ...question,
    parts: insert(question.parts, part, options.index),
  }));
}

export function removePart(set: QuestionSet, questionId: string, partId: string): QuestionSet {
  return updateQuestion(set, questionId, (question) => ({
    ...question,
    parts: remove(question.parts, partId),
  }));
}

export function movePart(
  set: QuestionSet,
  questionId: string,
  partId: string,
  toIndex: number,
): QuestionSet {
  return updateQuestion(set, questionId, (question) => ({
    ...question,
    parts: move(question.parts, partId, toIndex),
  }));
}

export function addSubpart(
  set: QuestionSet,
  questionId: string,
  partId: string,
  options: { id?: string; index?: number } = {},
): QuestionSet {
  const subpart: QuestionSubpart = { id: options.id ?? makeId(), prompt: '' };
  return updateQuestion(set, questionId, (question) =>
    updatePart(question, partId, (part) => ({
      ...part,
      subparts: insert(part.subparts, subpart, options.index),
    })),
  );
}

export function removeSubpart(
  set: QuestionSet,
  questionId: string,
  partId: string,
  subpartId: string,
): QuestionSet {
  return updateQuestion(set, questionId, (question) =>
    updatePart(question, partId, (part) => ({
      ...part,
      subparts: remove(part.subparts, subpartId),
    })),
  );
}

export function moveSubpart(
  set: QuestionSet,
  questionId: string,
  partId: string,
  subpartId: string,
  toIndex: number,
): QuestionSet {
  return updateQuestion(set, questionId, (question) =>
    updatePart(question, partId, (part) => ({
      ...part,
      subparts: move(part.subparts, subpartId, toIndex),
    })),
  );
}
