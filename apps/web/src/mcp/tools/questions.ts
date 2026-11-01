// Concept, Question and built-in generator tools. Question attempts are
// deliberately absent: an agent must not manufacture answer evidence or mutate
// either the Question or Card memory model on the learner's behalf.

import type { ToolDefinition } from '../types';
import { createConcept, deleteConcept, listConcepts, updateConcept } from './questions/concepts';
import {
  createFixedQuestion,
  createGeneratedQuestion,
  deleteQuestion,
  getQuestion,
  listQuestions,
  updateFixedQuestion,
  updateGeneratedQuestion,
} from './questions/definitions';
import { auditQuestionGenerator, listQuestionGenerators } from './questions/generators';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous checked definitions.
export const QUESTION_TOOLS: readonly ToolDefinition<any, any>[] = [
  listConcepts,
  createConcept,
  updateConcept,
  deleteConcept,
  listQuestions,
  getQuestion,
  createFixedQuestion,
  updateFixedQuestion,
  createGeneratedQuestion,
  updateGeneratedQuestion,
  deleteQuestion,
  listQuestionGenerators,
  auditQuestionGenerator,
];

export {
  listConcepts,
  createConcept,
  updateConcept,
  deleteConcept,
  listQuestions,
  getQuestion,
  createFixedQuestion,
  updateFixedQuestion,
  createGeneratedQuestion,
  updateGeneratedQuestion,
  deleteQuestion,
  listQuestionGenerators,
  auditQuestionGenerator,
};
