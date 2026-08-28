import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse, createLesson } from '../db/repository';
import { db } from '../db/schema';
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
      targets: [{ kind: 'course', id: course.id, label: 'Biology' }],
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
});
