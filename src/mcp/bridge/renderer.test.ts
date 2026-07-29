import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { createCourse, createLesson } from '../../db/repository';
import { getTool } from '../registry';
import type { ToolContext } from '../types';
import { handleInvoke } from './renderer';
import type { McpInvokeResponse } from './protocol';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('MCP renderer invocation grants', () => {
  it('rejects a grant for a different course before running the handler', async () => {
    const course = await createCourse('Biology');
    const reply = vi.fn<(response: McpInvokeResponse) => void>();

    await handleInvoke({
      id: 'one', tool: 'lacuna.create_lesson', input: { courseId: course.id, name: 'Cells' }, agentId: 'agent',
      grant: { courseId: 'another-course', scope: 'write', grantedAt: 1 },
    }, reply, {});

    expect(reply).toHaveBeenCalledWith({
      id: 'one', ok: false,
      error: { kind: 'forbidden', message: 'The MCP invocation grant does not match the requested tool scope.' },
    });
    expect(await db.lessons.count()).toBe(0);
  });

  it('passes the validated grant to the actual tool invocation', async () => {
    const grant = { courseId: '__global__', scope: 'read' as const, grantedAt: 42, label: 'All Lacuna data' };
    const reply = vi.fn<(response: McpInvokeResponse) => void>();
    const tool = getTool('lacuna.list_courses')!;
    const handler = vi.spyOn(tool, 'handler').mockImplementation(async (_input: unknown, ctx: ToolContext) => ({ data: ctx.grant }));

    try {
      await handleInvoke({ id: 'one', tool: tool.name, input: {}, agentId: 'agent', grant }, reply, {});
    } finally {
      handler.mockRestore();
    }

    expect(reply).toHaveBeenCalledWith({ id: 'one', ok: true, result: grant });
  });

  it('rejects a grant below the tool required scope', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const reply = vi.fn<(response: McpInvokeResponse) => void>();

    await handleInvoke({
      id: 'one', tool: 'lacuna.delete_lesson', input: { lessonId: lesson.id }, agentId: 'agent',
      grant: { courseId: course.id, scope: 'write', grantedAt: 1 },
    }, reply, {});

    expect(reply.mock.calls[0][0]).toMatchObject({ id: 'one', ok: false, error: { kind: 'forbidden' } });
    expect(await db.lessons.get(lesson.id)).toBeDefined();
  });
});
