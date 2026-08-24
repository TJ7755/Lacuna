import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { createCourse } from '../../db/repository';
import {
  createConcept,
  createFixedQuestion,
  restoreConcept,
  restoreQuestion,
} from '../../questions/repository';
import type { Concept } from '../../questions/types';
import type { QuestionSnapshot } from '../../questions/repository';
import { MCP_TOOL_SURFACE_VERSION, TOOL_REGISTRY, validateAndRun } from '../registry';
import type { ToolContext } from '../types';
import * as tools from './questions';

const ctx: ToolContext = { grant: null, agentId: 'test-agent' };

async function clearAll(): Promise<void> {
  await Promise.all([
    db.questionAttempts.clear(),
    db.questionConcepts.clear(),
    db.questions.clear(),
    db.cards.clear(),
    db.concepts.clear(),
    db.lessons.clear(),
    db.courseAssessments.clear(),
    db.courses.clear(),
    db.schedulingUnits.clear(),
    db.tombstones.clear(),
  ]);
}

describe('MCP Question tools', () => {
  beforeEach(clearAll);

  it('registers additive Question tools but no attempt-recording surface', () => {
    const names = TOOL_REGISTRY.map((tool) => tool.name);

    expect(names).toContain('lacuna.list_concepts');
    expect(names).toContain('lacuna.create_fixed_question');
    expect(names).toContain('lacuna.create_generated_question');
    expect(names).toContain('lacuna.audit_question_generator');
    expect(names.some((name) => name.includes('attempt'))).toBe(false);
    expect(names.some((name) => name.includes('record_question'))).toBe(false);
    expect(MCP_TOOL_SURFACE_VERSION).toBe(3);
  });

  it('creates, lists and updates Concepts through the Question repository', async () => {
    const course = await createCourse('Physics');
    const created = await tools.createConcept.handler(
      { courseId: course.id, name: 'Conservation of energy' },
      ctx,
    );

    expect((await tools.listConcepts.handler({ courseId: course.id }, ctx)).data).toEqual([
      expect.objectContaining({ id: created.data.id, name: 'Conservation of energy' }),
    ]);
    await tools.updateConcept.handler(
      { conceptId: created.data.id, name: 'Energy conservation' },
      ctx,
    );
    expect((await db.concepts.get(created.data.id))?.name).toBe('Energy conservation');
  });

  it('creates and updates a fixed Question with compiled marking and explicit concepts', async () => {
    const course = await createCourse('Mathematics');
    const target = await createConcept(course.id, 'Solve linear equations');
    const prerequisite = await createConcept(course.id, 'Collect like terms');

    const created = await tools.createFixedQuestion.handler(
      {
        courseId: course.id,
        name: 'Linear equation application',
        prompt: 'Solve 2x + 1 = 7.',
        explanation: 'Subtract one, then divide by two.',
        payload: { kind: 'numeric', answer: { kind: 'exact', value: '3' } },
        targetConceptId: target.id,
        prerequisiteConceptIds: [prerequisite.id],
      },
      ctx,
    );

    expect(created.data.question).toMatchObject({
      kind: 'fixed',
      payload: { v: 1, kind: 'numeric' },
    });
    expect(created.data.concepts).toMatchObject({
      targetConceptIds: [target.id],
      prerequisiteConceptIds: [prerequisite.id],
    });

    const updated = await tools.updateFixedQuestion.handler(
      {
        questionId: created.data.question.id,
        prompt: 'Solve 3x + 1 = 7.',
        payload: { kind: 'numeric', answer: { kind: 'exact', value: '2' } },
      },
      ctx,
    );
    expect(updated.data.question).toMatchObject({ prompt: 'Solve 3x + 1 = 7.' });
    expect(updated.data.question.contentVersion).toBe(2);
  });

  it('rejects invalid working fixtures before a fixed Question is created', async () => {
    const course = await createCourse('Mathematics');
    const target = await createConcept(course.id, 'Solve equations');
    const result = await validateAndRun(
      tools.createFixedQuestion,
      {
        courseId: course.id,
        name: 'Broken Question',
        prompt: 'Solve 2x = 8.',
        explanation: 'Divide both sides by two.',
        payload: {
          kind: 'working',
          scheme: '[1] answer :: equals :: 4',
          fixtures: [{ studentAnswer: ['5'], expectedMarks: 1 }],
        },
        targetConceptId: target.id,
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('validation');
    expect(await db.questions.count()).toBe(0);
  });

  it('rejects blank feedback, incoherent Concept links and no-op Question updates', async () => {
    const course = await createCourse('Mathematics');
    const target = await createConcept(course.id, 'Solve equations');

    const blankFeedback = await validateAndRun(
      tools.createFixedQuestion,
      {
        courseId: course.id,
        name: 'Linear equation',
        prompt: 'Solve x = 4.',
        explanation: '   ',
        payload: { kind: 'numeric', answer: { kind: 'exact', value: '4' } },
        targetConceptId: target.id,
      },
      ctx,
    );
    expect(blankFeedback.ok).toBe(false);
    if (!blankFeedback.ok) expect(blankFeedback.error.kind).toBe('validation');

    const repeatedTarget = await validateAndRun(
      tools.createFixedQuestion,
      {
        courseId: course.id,
        name: 'Linear equation',
        prompt: 'Solve x = 4.',
        explanation: 'The value is already isolated.',
        payload: { kind: 'numeric', answer: { kind: 'exact', value: '4' } },
        targetConceptId: target.id,
        prerequisiteConceptIds: [target.id],
      },
      ctx,
    );
    expect(repeatedTarget.ok).toBe(false);
    if (!repeatedTarget.ok) expect(repeatedTarget.error.kind).toBe('validation');
    expect(await db.questions.count()).toBe(0);

    const question = await createFixedQuestion({
      courseId: course.id,
      name: 'Linear equation',
      prompt: 'Solve x = 4.',
      explanation: 'The value is already isolated.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
      targetConceptId: target.id,
    });
    const noChanges = await validateAndRun(
      tools.updateFixedQuestion,
      { questionId: question.id },
      ctx,
    );
    expect(noChanges.ok).toBe(false);
    if (!noChanges.ok) expect(noChanges.error.kind).toBe('validation');
  });

  it('lists and audits only built-in generator contracts, then creates a generated family', async () => {
    const course = await createCourse('Mathematics');
    const target = await createConcept(course.id, 'Solve quadratic equations');
    const generators = await tools.listQuestionGenerators.handler({}, ctx);
    const builtIn = generators.data.find((generator) => generator.key === 'integer-root-quadratic');
    expect(builtIn).toBeDefined();

    const configuration = {
      minimumRootMagnitude: 1,
      maximumRootMagnitude: 2,
      maximumLeadingCoefficient: 2,
      allowRepeatedRoots: false,
    };
    const audit = await tools.auditQuestionGenerator.handler(
      {
        generatorKey: 'integer-root-quadratic',
        generatorVersion: 1,
        generatorConfig: configuration,
      },
      ctx,
    );
    expect(audit.data.fingerprintCount).toBeGreaterThan(1);

    const created = await tools.createGeneratedQuestion.handler(
      {
        courseId: course.id,
        name: 'Quadratic family',
        generatorKey: 'integer-root-quadratic',
        generatorVersion: 1,
        generatorConfig: configuration,
        targetConceptId: target.id,
      },
      ctx,
    );
    expect(created.data.question).toMatchObject({
      kind: 'generated',
      generatorKey: 'integer-root-quadratic',
    });
  });

  it('returns not_found for a missing Question instead of leaking an internal error', async () => {
    const result = await validateAndRun(tools.getQuestion, { questionId: 'missing-question' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not_found');
  });

  it('deletes Questions and unreferenced Concepts with destructive undo snapshots', async () => {
    const course = await createCourse('Mathematics');
    const target = await createConcept(course.id, 'Linear equations');
    const question = await createFixedQuestion({
      courseId: course.id,
      name: 'Application',
      prompt: 'Solve x = 2.',
      explanation: 'The value is already isolated.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
      targetConceptId: target.id,
    });

    const deletedQuestion = await tools.deleteQuestion.handler({ questionId: question.id }, ctx);
    expect(deletedQuestion.undo?.kind).toBe('restoreQuestion');
    expect(await db.questions.get(question.id)).toBeUndefined();

    const deletedConcept = await tools.deleteConcept.handler({ conceptId: target.id }, ctx);
    expect(deletedConcept.undo?.kind).toBe('restoreConcept');
    expect(await db.concepts.get(target.id)).toBeUndefined();

    await restoreConcept(deletedConcept.undo?.snapshot as Concept);
    await restoreQuestion(deletedQuestion.undo?.snapshot as QuestionSnapshot);

    expect(await db.concepts.get(target.id)).toEqual(target);
    expect(await db.questions.get(question.id)).toEqual(
      (deletedQuestion.undo?.snapshot as QuestionSnapshot).question,
    );
    expect(await db.questionConcepts.get(question.id)).toEqual(
      (deletedQuestion.undo?.snapshot as QuestionSnapshot).concepts,
    );
  });
});
