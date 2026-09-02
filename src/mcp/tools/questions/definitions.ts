import type { z } from 'zod';
import type { NumericAnswerSpec } from '../../../db/types';
import { runWorkingFixtures } from '../../../items/fixtureRunner';
import { compileMarkScheme } from '../../../items/markSchemeCompiler';
import { numericAnswerSpecIsValid } from '../../../items/numericAnswerSpec';
import {
  createFixedQuestion as repoCreateFixedQuestion,
  createGeneratedQuestion as repoCreateGeneratedQuestion,
  deleteQuestion as repoDeleteQuestion,
  type getQuestion as repoGetQuestion,
  listQuestions as repoListQuestions,
  snapshotQuestion as repoSnapshotQuestion,
  updateFixedQuestion as repoUpdateFixedQuestion,
  updateGeneratedQuestion as repoUpdateGeneratedQuestion,
} from '../../../questions/repository';
import type { QuestionPayload } from '../../../questions/types';
import type {
  questionPayloadInputSchema} from '../../contracts/questions';
import {
  createFixedQuestionContract,
  createGeneratedQuestionContract,
  deleteQuestionContract,
  getQuestionContract,
  listQuestionsContract,
  updateFixedQuestionContract,
  updateGeneratedQuestionContract,
} from '../../contracts/questions';
import type { ToolDefinition } from '../../types';
import { auditGenerator } from './generators';
import {
  notFound,
  ok,
  requireCourse,
  requireLesson,
  requireQuestion,
  requireRelationships,
  validation,
} from './shared';

function compileQuestionPayload(
  input: z.infer<typeof questionPayloadInputSchema>,
): QuestionPayload {
  if (input.kind === 'numeric') {
    if (!numericAnswerSpecIsValid(input.answer)) {
      validation('The numeric answer specification is invalid.');
    }
    return { v: 1, kind: 'numeric', answer: input.answer as NumericAnswerSpec };
  }

  const compilation = compileMarkScheme(input.scheme);
  const errors = compilation.lines.filter((line) => line.kind === 'error');
  if (errors.length > 0 || compilation.lines.length === 0) {
    validation(
      errors.length > 0
        ? errors.map((error) => `Scheme line ${error.lineNumber}: ${error.message}`).join('\n')
        : 'Add a mark scheme.',
    );
  }
  const scheme = compilation.lines.flatMap((line) =>
    line.kind === 'compiled' ? [line.value] : [],
  );
  const fixtures = (input.fixtures ?? []).map((fixture, index) => ({
    ...fixture,
    id: fixture.id ?? `mcp-question-fixture-${index + 1}`,
  }));
  const failingFixture = runWorkingFixtures(scheme, fixtures).find((run) => !run.passes);
  if (failingFixture) {
    validation(
      `Fixture expected ${failingFixture.fixture.expectedMarks} marks but received ${failingFixture.marksEarned}.`,
    );
  }
  return {
    v: 1,
    kind: 'working',
    scheme,
    ...(fixtures.length > 0 ? { fixtures } : {}),
  };
}

export const listQuestions: ToolDefinition<
  z.infer<typeof listQuestionsContract.inputSchema>,
  Awaited<ReturnType<typeof repoListQuestions>>
> = {
  ...listQuestionsContract,
  async handler({ courseId, lessonId, kind }) {
    await requireCourse(courseId);
    if (lessonId !== undefined) {
      await requireLesson(courseId, lessonId);
    }
    const questions = await repoListQuestions(courseId);
    return ok(
      questions.filter(
        (question) =>
          (kind === undefined || question.kind === kind) &&
          (lessonId === undefined ||
            question.primaryLessonId === lessonId ||
            question.additionalLessonIds.includes(lessonId)),
      ),
    );
  },
};

export const getQuestion: ToolDefinition<
  z.infer<typeof getQuestionContract.inputSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  ...getQuestionContract,
  async handler({ questionId }) {
    return ok(await requireQuestion(questionId));
  },
};

export const createFixedQuestion: ToolDefinition<
  z.infer<typeof createFixedQuestionContract.inputSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  ...createFixedQuestionContract,
  async handler(input) {
    await requireRelationships(
      input.courseId,
      input.primaryLessonId,
      input.additionalLessonIds,
      input.targetConceptId,
      input.prerequisiteConceptIds,
    );
    const question = await repoCreateFixedQuestion({
      ...input,
      payload: compileQuestionPayload(input.payload),
    });
    return ok(await requireQuestion(question.id));
  },
};

export const updateFixedQuestion: ToolDefinition<
  z.infer<typeof updateFixedQuestionContract.inputSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  ...updateFixedQuestionContract,
  async handler({ questionId, payload, ...changes }) {
    const existing = await requireQuestion(questionId);
    if (existing.question.kind !== 'fixed') validation('The Question is not fixed.');
    const targetConceptId = changes.targetConceptId ?? existing.concepts.targetConceptIds[0];
    if (!targetConceptId) validation('A Question requires one primary target Concept.');
    await requireRelationships(
      existing.question.courseId,
      changes.primaryLessonId === undefined
        ? existing.question.primaryLessonId
        : changes.primaryLessonId,
      changes.additionalLessonIds ?? existing.question.additionalLessonIds,
      targetConceptId,
      changes.prerequisiteConceptIds ?? existing.concepts.prerequisiteConceptIds,
    );
    await repoUpdateFixedQuestion(questionId, {
      ...changes,
      ...(payload === undefined ? {} : { payload: compileQuestionPayload(payload) }),
    });
    return ok(await requireQuestion(questionId));
  },
};

export const createGeneratedQuestion: ToolDefinition<
  z.infer<typeof createGeneratedQuestionContract.inputSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  ...createGeneratedQuestionContract,
  async handler(input) {
    await requireRelationships(
      input.courseId,
      input.primaryLessonId,
      input.additionalLessonIds,
      input.targetConceptId,
      input.prerequisiteConceptIds,
    );
    auditGenerator(input);
    const question = await repoCreateGeneratedQuestion(input);
    return ok(await requireQuestion(question.id));
  },
};

export const updateGeneratedQuestion: ToolDefinition<
  z.infer<typeof updateGeneratedQuestionContract.inputSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  ...updateGeneratedQuestionContract,
  async handler({ questionId, ...changes }) {
    const existing = await requireQuestion(questionId);
    if (existing.question.kind !== 'generated') validation('The Question is not generated.');
    const targetConceptId = changes.targetConceptId ?? existing.concepts.targetConceptIds[0];
    if (!targetConceptId) validation('A Question requires one primary target Concept.');
    await requireRelationships(
      existing.question.courseId,
      changes.primaryLessonId === undefined
        ? existing.question.primaryLessonId
        : changes.primaryLessonId,
      changes.additionalLessonIds ?? existing.question.additionalLessonIds,
      targetConceptId,
      changes.prerequisiteConceptIds ?? existing.concepts.prerequisiteConceptIds,
    );
    if (
      changes.generatorKey !== undefined ||
      changes.generatorVersion !== undefined ||
      changes.generatorConfig !== undefined
    ) {
      auditGenerator({
        generatorKey: changes.generatorKey ?? existing.question.generatorKey,
        generatorVersion: changes.generatorVersion ?? existing.question.generatorVersion,
        generatorConfig: changes.generatorConfig ?? existing.question.generatorConfig,
      });
    }
    await repoUpdateGeneratedQuestion(questionId, changes);
    return ok(await requireQuestion(questionId));
  },
};

export const deleteQuestion: ToolDefinition<
  z.infer<typeof deleteQuestionContract.inputSchema>,
  { id: string }
> = {
  ...deleteQuestionContract,
  async handler({ questionId }) {
    const snapshot = await repoSnapshotQuestion(questionId);
    if (!snapshot) notFound('Question', questionId);
    await repoDeleteQuestion(questionId);
    return {
      data: { id: questionId },
      undo: { kind: 'restoreQuestion', snapshot },
    };
  },
};
