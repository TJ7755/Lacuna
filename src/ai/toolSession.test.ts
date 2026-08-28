import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse, createLesson } from '../db/repository';
import { db } from '../db/schema';
import { createConcept } from '../questions/repository';
import type { AiToolSessionDependencies, AiToolInvokeRequest } from './toolSession';
import { AiToolSession } from './toolSession';
import type { ToolExecutionOutcome, ToolExecutionRequest } from '../mcp/executor';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function makeExecutor() {
  return vi.fn(
    async (request: ToolExecutionRequest): Promise<ToolExecutionOutcome> => ({
      ok: true,
      result:
        request.toolName === 'lacuna.create_course'
          ? { id: 'created-course', name: (request.input as { name: string }).name }
          : { id: 'result' },
      receipt: {
        callId: request.callId,
        toolName: request.toolName,
        requiredScope: request.grant.scope,
        target: { courseId: request.grant.courseId, label: request.grant.label },
        completedAt: 100,
      },
    }),
  );
}

function makeSession(
  executeToolCall = makeExecutor(),
  state?: unknown,
  ids: string[] = ['approval-1', 'receipt-1'],
): { session: AiToolSession; executeToolCall: ReturnType<typeof makeExecutor> } {
  let idIndex = 0;
  const dependencies: AiToolSessionDependencies = {
    executeToolCall,
    now: () => 100,
    createId: () => ids[idIndex++] ?? `generated-${idIndex}`,
    digest: (input) => input,
  };
  return { session: new AiToolSession(dependencies, state), executeToolCall };
}

function invoke(
  session: AiToolSession,
  overrides: Partial<AiToolInvokeRequest> = {},
): ReturnType<AiToolSession['invoke']> {
  return session.invoke({
    connectionId: 'connection-1',
    runId: 'run-1',
    runStatus: 'active',
    callId: 'call-1',
    toolName: 'lacuna.list_courses',
    input: {},
    ...overrides,
  });
}

describe('AiToolSession', () => {
  it('executes reads with an implicit exact read grant', async () => {
    const { session, executeToolCall } = makeSession();

    const outcome = await invoke(session);

    expect(outcome.response).toEqual({ ok: true, result: { id: 'result' } });
    expect(executeToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'connection-1',
        grant: expect.objectContaining({ courseId: '__global__', scope: 'read' }),
      }),
    );
  });

  it('requires write approval, then retries the original call after granting it', async () => {
    const course = await createCourse('Biology');
    const { session, executeToolCall } = makeSession();
    const request = {
      toolName: 'lacuna.create_lesson',
      input: { courseId: course.id, name: 'Cells' },
    };

    const pending = await invoke(session, request);
    expect(pending.response).toMatchObject({
      ok: false,
      error: { kind: 'approval_required', approvalId: 'approval-1', approvalKind: 'write_grant' },
    });
    expect(pending.effects.approval?.status).toBe('pending');

    const approvalId = pending.effects.approval!.approvalId;
    const decided = await session.decide(approvalId, true);
    expect(decided).toMatchObject({ ok: true, approval: { status: 'approved' } });

    const completed = await invoke(session, request);
    expect(completed.response).toMatchObject({ ok: true, result: { id: 'result' } });
    expect(completed.effects.receipt).toMatchObject({
      toolName: 'lacuna.create_lesson',
      summary: 'Created Cells',
      targets: [
        {
          kind: 'lesson',
          id: 'result',
          courseId: course.id,
          label: 'Cells',
        },
      ],
    });
    expect(executeToolCall).toHaveBeenCalledTimes(1);
  });

  it('binds destructive approval exactly and consumes it before execution', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const otherLesson = await createLesson(course.id, 'Atoms');
    const { session, executeToolCall } = makeSession();
    const request = {
      toolName: 'lacuna.delete_lesson',
      input: { lessonId: lesson.id },
    };

    const pending = await invoke(session, request);
    expect(pending.response).toMatchObject({
      ok: false,
      error: { kind: 'approval_required', approvalKind: 'destructive_call' },
    });
    const approvalId = pending.effects.approval!.approvalId;
    await session.decide(approvalId, true);

    const mismatched = await invoke(session, { input: { lessonId: otherLesson.id } });
    expect(mismatched.response).toMatchObject({ ok: false, error: { kind: 'conflict' } });

    const completed = await invoke(session, request);
    expect(completed.response.ok).toBe(true);
    expect(session.exportState().approvals[0].approval.status).toBe('consumed');
    expect(executeToolCall).toHaveBeenCalledTimes(1);

    const replay = await invoke(session, request);
    expect(replay.response).toEqual(completed.response);
    expect(executeToolCall).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a rejected approval', async () => {
    const course = await createCourse('Biology');
    const { session } = makeSession();
    const request = {
      toolName: 'lacuna.create_lesson',
      input: { courseId: course.id, name: 'Cells' },
    };
    const pending = await invoke(session, request);

    await session.decide(pending.effects.approval!.approvalId, false);
    const retry = await invoke(session, request);

    expect(retry.response).toMatchObject({ ok: false, error: { kind: 'conflict' } });
  });

  it('rejects stopped and disconnected runs before admission', async () => {
    const { session, executeToolCall } = makeSession();

    await expect(invoke(session, { runStatus: 'stopped' })).resolves.toMatchObject({
      response: { ok: false, error: { kind: 'stopped', runId: 'run-1' } },
    });
    await expect(invoke(session, { runStatus: 'disconnected' })).resolves.toMatchObject({
      response: { ok: false, error: { kind: 'unavailable', reason: 'disconnected' } },
    });
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('replays completed calls and rejects a callId with another binding', async () => {
    const firstCourse = await createCourse('First');
    const secondCourse = await createCourse('Second');
    const { session, executeToolCall } = makeSession();
    const request = { toolName: 'lacuna.get_course', input: { courseId: firstCourse.id } };
    const first = await invoke(session, request);
    const replay = await invoke(session, request);
    const mismatch = await invoke(session, { input: { courseId: secondCourse.id } });

    expect(replay.response).toEqual(first.response);
    expect(mismatch.response).toMatchObject({ ok: false, error: { kind: 'conflict' } });
    expect(executeToolCall).toHaveBeenCalledTimes(1);
  });

  it('restores bounded grants and the call ledger', async () => {
    const course = await createCourse('Biology');
    const first = makeSession();
    const request = {
      toolName: 'lacuna.create_lesson',
      input: { courseId: course.id, name: 'Cells' },
    };
    const pending = await invoke(first.session, request);
    await first.session.decide(pending.effects.approval!.approvalId, true);
    await invoke(first.session, request);

    const restored = makeSession(first.executeToolCall, first.session.exportState());
    const replay = await invoke(restored.session, request);

    expect(replay.response).toMatchObject({ ok: true });
    expect(restored.executeToolCall).toHaveBeenCalledTimes(1);
  });

  it('creates a real course receipt from the returned course identity', async () => {
    const { session } = makeSession();
    const pending = await invoke(session, {
      toolName: 'lacuna.create_course',
      input: { name: 'Biology' },
    });
    await session.decide(pending.effects.approval!.approvalId, true);
    const outcome = await invoke(session, {
      toolName: 'lacuna.create_course',
      input: { name: 'Biology' },
    });

    expect(outcome.effects.receipt).toEqual({
      receiptId: 'receipt-1',
      callId: 'call-1',
      toolName: 'lacuna.create_course',
      summary: 'Created Biology',
      createdAt: 100,
      targets: [{ kind: 'course', id: 'created-course', label: 'Biology' }],
    });
  });

  it('bounds receipt copy without failing a committed course creation', async () => {
    const { session } = makeSession();
    const name = 'A'.repeat(2_000);
    const request = { toolName: 'lacuna.create_course', input: { name } };
    const pending = await invoke(session, request);
    await session.decide(pending.effects.approval!.approvalId, true);

    const outcome = await invoke(session, request);

    expect(outcome.response).toMatchObject({ ok: true });
    expect(outcome.effects.receipt?.targets[0]?.label).toHaveLength(120);
    expect(outcome.effects.receipt?.targets[0]?.label.endsWith('…')).toBe(true);
  });

  it('normalises optional card fields before returning create and list results', async () => {
    let idIndex = 0;
    const session = new AiToolSession({
      now: () => 100,
      createId: () => `generated-${++idIndex}`,
      digest: async (input) => input,
    });
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const createRequest = {
      connectionId: 'connection-1',
      runId: 'run-1',
      runStatus: 'active' as const,
      callId: 'create-card-1',
      toolName: 'lacuna.create_card',
      input: {
        courseId: course.id,
        lessonId: lesson.id,
        type: 'front_back',
        front: 'What is a cell?',
        back: 'The basic structural unit of life.',
      },
    };

    const pending = await session.invoke(createRequest);
    expect(pending.response).toMatchObject({
      ok: false,
      error: { kind: 'approval_required', approvalKind: 'write_grant' },
    });
    await session.decide(pending.effects.approval!.approvalId, true);

    const created = await session.invoke(createRequest);
    expect(created.response).toMatchObject({
      ok: true,
      result: { courseId: course.id, primaryLessonId: lesson.id },
    });
    const createdCard = await db.cards.toCollection().first();
    expect(created.effects.receipt).toMatchObject({
      toolName: 'lacuna.create_card',
      summary: 'Created card: What is a cell?',
      targets: [
        {
          kind: 'card',
          id: createdCard?.id,
          courseId: course.id,
          label: 'What is a cell?',
        },
      ],
    });
    expect(await db.cards.count()).toBe(1);

    const listed = await session.invoke({
      ...createRequest,
      callId: 'list-cards-1',
      toolName: 'lacuna.list_cards',
      input: { courseId: course.id },
    });
    expect(listed.response).toMatchObject({
      ok: true,
      result: [{ courseId: course.id, primaryLessonId: lesson.id }],
    });
  });

  it('returns a selectable receipt for a created fixed Question', async () => {
    let idIndex = 0;
    const session = new AiToolSession({
      now: () => 100,
      createId: () => `generated-${++idIndex}`,
      digest: async (input) => input,
    });
    const course = await createCourse('Mathematics');
    const lesson = await createLesson(course.id, 'Equations');
    const concept = await createConcept(course.id, 'Solve linear equations');
    const request = {
      connectionId: 'connection-1',
      runId: 'run-1',
      runStatus: 'active' as const,
      callId: 'create-question-1',
      toolName: 'lacuna.create_fixed_question',
      input: {
        courseId: course.id,
        primaryLessonId: lesson.id,
        name: 'Linear equation application',
        prompt: 'Solve 2x + 1 = 7.',
        explanation: 'Subtract one, then divide by two.',
        payload: { kind: 'numeric' as const, answer: { kind: 'exact' as const, value: '3' } },
        targetConceptId: concept.id,
      },
    };

    const pending = await session.invoke(request);
    await session.decide(pending.effects.approval!.approvalId, true);
    const created = await session.invoke(request);
    const question = await db.questions.toCollection().first();

    expect(created.effects.receipt).toMatchObject({
      toolName: 'lacuna.create_fixed_question',
      summary: 'Created Question: Linear equation application',
      targets: [
        {
          kind: 'question',
          id: question?.id,
          courseId: course.id,
          label: 'Linear equation application',
        },
      ],
    });
  });

  it('returns a selectable receipt for a created assessment', async () => {
    let idIndex = 0;
    const session = new AiToolSession({
      now: () => 100,
      createId: () => `generated-${++idIndex}`,
      digest: async (input) => input,
    });
    const course = await createCourse('Mathematics');
    const lesson = await createLesson(course.id, 'Equations');
    const request = {
      connectionId: 'connection-1',
      runId: 'run-1',
      runStatus: 'active' as const,
      callId: 'create-assessment-1',
      toolName: 'lacuna.create_course_assessment',
      input: {
        courseId: course.id,
        name: 'Algebra checkpoint',
        examDate: Date.UTC(2026, 10, 12, 9),
        timeZone: 'Europe/London',
        afterLessonId: lesson.id,
        coverageMode: 'prefix' as const,
      },
    };

    const pending = await session.invoke(request);
    await session.decide(pending.effects.approval!.approvalId, true);
    const created = await session.invoke(request);
    const assessment = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .filter((candidate) => candidate.kind === 'checkpoint')
      .first();

    expect(created.effects.receipt).toMatchObject({
      toolName: 'lacuna.create_course_assessment',
      summary: 'Created assessment: Algebra checkpoint',
      targets: [
        {
          kind: 'assessment',
          id: assessment?.id,
          courseId: course.id,
          label: 'Algebra checkpoint',
        },
      ],
    });
  });

  it('uses one-shot write approval for course creation and clears all capability state', async () => {
    const { session } = makeSession();
    const request = { toolName: 'lacuna.create_course', input: { name: 'Biology' } };
    const pending = await invoke(session, request);

    expect(pending.effects.approval).toMatchObject({ kind: 'write_call', status: 'pending' });
    await session.decide(pending.effects.approval!.approvalId, true);
    await invoke(session, request);
    session.clear();

    const afterClear = await invoke(session, {
      ...request,
      callId: 'call-2',
      input: { name: 'Chemistry' },
    });
    expect(afterClear.response).toMatchObject({
      ok: false,
      error: { kind: 'approval_required', approvalKind: 'write_call' },
    });
  });

  it('uses explicit memory scope, a reusable write grant and one-shot destructive approval', async () => {
    let idIndex = 0;
    const session = new AiToolSession({
      now: () => 100,
      createId: () => `generated-${++idIndex}`,
      digest: async (input) => input,
    });
    const createRequest = {
      connectionId: 'connection-1',
      runId: 'run-1',
      runStatus: 'active' as const,
      callId: 'create-memory-1',
      toolName: 'lacuna.create_memory',
      input: {
        scope: { kind: 'global' as const },
        tags: ['preference' as const],
        content: 'Prefer concise worked examples.',
        basis: 'learner-stated' as const,
      },
    };

    const pendingCreate = await session.invoke(createRequest);
    expect(pendingCreate.response).toMatchObject({
      ok: false,
      error: { kind: 'approval_required', approvalKind: 'write_grant' },
    });
    await session.decide(pendingCreate.effects.approval!.approvalId, true);
    const created = await session.invoke(createRequest);
    expect(created.response).toMatchObject({
      ok: true,
      result: { courseId: null, content: 'Prefer concise worked examples.' },
    });
    if (!created.response.ok) throw new Error('Expected a created memory.');
    const memoryId = (created.response.result as { id: string }).id;

    const searched = await session.invoke({
      ...createRequest,
      callId: 'search-memory-1',
      toolName: 'lacuna.search_memories',
      input: { scope: { kind: 'global' }, query: 'worked examples' },
    });
    expect(searched.response).toMatchObject({ ok: true, result: [{ id: memoryId }] });

    const deleteRequest = {
      ...createRequest,
      callId: 'delete-memory-1',
      toolName: 'lacuna.delete_memory',
      input: { memoryId },
    };
    const pendingDelete = await session.invoke(deleteRequest);
    expect(pendingDelete.response).toMatchObject({
      ok: false,
      error: { kind: 'approval_required', approvalKind: 'destructive_call' },
    });
    await session.decide(pendingDelete.effects.approval!.approvalId, true);
    const deleted = await session.invoke(deleteRequest);
    expect(deleted.response).toMatchObject({ ok: true, result: { id: memoryId } });
    expect(await db.agentMemories.get(memoryId)).toBeUndefined();

    const replay = await session.invoke(deleteRequest);
    expect(replay.response).toEqual(deleted.response);
    expect(await db.agentMemories.get(memoryId)).toBeUndefined();
  });
});
