import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse, createLesson } from '../db/repository';
import { executeToolCall } from './executor';
import type { McpGrant } from './types';
import { CREATE_COURSE_SCOPE_KEY } from './bridge/scopeResolver';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function request(
  toolName: string,
  input: unknown = {},
  grant: McpGrant = { courseId: '__global__', scope: 'read', grantedAt: 1 },
) {
  return { callId: 'call-1', toolName, input, agentId: 'agent-1', grant };
}

describe('executeToolCall', () => {
  it('rejects an unknown tool', async () => {
    await expect(executeToolCall(request('lacuna.unknown', {}))).resolves.toEqual({
      ok: false,
      error: { kind: 'not_found', message: 'Unknown tool "lacuna.unknown".' },
    });
  });

  it('validates input before resolving a live scope', async () => {
    await expect(executeToolCall(request('lacuna.get_course', {}))).resolves.toMatchObject({
      ok: false,
      error: { kind: 'validation' },
    });
  });

  it('rejects a grant for a different resolved course', async () => {
    const course = await createCourse('Biology');

    await expect(
      executeToolCall(
        request(
          'lacuna.create_lesson',
          { courseId: course.id, name: 'Cells' },
          {
            courseId: 'different-course',
            scope: 'write',
            grantedAt: 1,
          },
        ),
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: 'forbidden',
        message: 'The MCP invocation grant does not match the requested tool scope.',
      },
    });
    expect(await db.lessons.count()).toBe(0);
  });

  it('rejects a grant below the required scope', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');

    await expect(
      executeToolCall(
        request(
          'lacuna.delete_lesson',
          { lessonId: lesson.id },
          {
            courseId: course.id,
            scope: 'write',
            grantedAt: 1,
          },
        ),
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: 'forbidden',
        message: 'The MCP invocation grant does not match the requested tool scope.',
      },
    });
    expect(await db.lessons.get(lesson.id)).toBeDefined();
  });

  it('returns the tool data and a receipt seed on success', async () => {
    const outcome = await executeToolCall(request('lacuna.list_courses'), { now: () => 123 });

    expect(outcome).toEqual({
      ok: true,
      result: [],
      receipt: {
        callId: 'call-1',
        toolName: 'lacuna.list_courses',
        requiredScope: 'read',
        target: { courseId: '__global__', label: 'All Lacuna data' },
        completedAt: 123,
      },
    });
  });

  it('uses the dedicated create-course scope rather than the global database scope', async () => {
    const outcome = await executeToolCall(
      request(
        'lacuna.create_course',
        { name: 'Biology' },
        {
          courseId: CREATE_COURSE_SCOPE_KEY,
          scope: 'write',
          grantedAt: 1,
        },
      ),
      { now: () => 123 },
    );

    expect(outcome).toMatchObject({
      ok: true,
      result: { name: 'Biology' },
      receipt: {
        toolName: 'lacuna.create_course',
        requiredScope: 'write',
        target: { courseId: CREATE_COURSE_SCOPE_KEY, label: 'New course: Biology' },
        completedAt: 123,
      },
    });
  });

  it('captures undo in the renderer and omits it from the result', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const onUndoAvailable = vi.fn();

    const outcome = await executeToolCall(
      request(
        'lacuna.delete_lesson',
        { lessonId: lesson.id },
        {
          courseId: course.id,
          scope: 'destructive',
          grantedAt: 1,
        },
      ),
      { onUndoAvailable, now: () => 123 },
    );

    expect(outcome).toMatchObject({
      ok: true,
      result: { id: lesson.id },
      receipt: {
        callId: 'call-1',
        toolName: 'lacuna.delete_lesson',
        requiredScope: 'destructive',
        target: { courseId: course.id, label: 'Biology' },
        completedAt: 123,
      },
    });
    expect(
      outcome.ok &&
        typeof outcome.result === 'object' &&
        outcome.result !== null &&
        'undo' in outcome.result,
    ).toBe(false);
    expect(onUndoAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'call-1',
        toolName: 'lacuna.delete_lesson',
        recordedAt: 123,
        payload: expect.objectContaining({ kind: 'restoreLesson' }),
      }),
    );
  });
});
