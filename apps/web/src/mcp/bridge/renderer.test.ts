import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { createCourse, createLesson } from '../../db/repository';
import { attachMcpBridge, type McpBridgeOptions } from './renderer';
import type { McpInvokeRequest, McpInvokeResponse } from '@lacuna/protocol/mcp/bridge';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => vi.unstubAllGlobals());

async function invokeThroughPreload(
  request: McpInvokeRequest,
  reply: (response: McpInvokeResponse) => void,
  options: McpBridgeOptions,
): Promise<void> {
  let receive!: (request: McpInvokeRequest) => void;
  let finish!: () => void;
  const replied = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const unsubscribe = vi.fn();
  vi.stubGlobal('electronAPI', {
    mcp: {
      onInvoke: (listener: typeof receive) => {
        receive = listener;
        return unsubscribe;
      },
      reply: (response: McpInvokeResponse) => {
        reply(response);
        finish();
      },
    },
  });
  const detach = attachMcpBridge(options);
  try {
    receive(request);
    await replied;
  } finally {
    detach?.();
  }
  expect(unsubscribe).toHaveBeenCalledOnce();
}

describe('MCP renderer invocation grants', () => {
  it('rejects a grant for a different course before running the handler', async () => {
    const course = await createCourse('Biology');
    const reply = vi.fn<(response: McpInvokeResponse) => void>();

    await invokeThroughPreload(
      {
        id: 'one',
        tool: 'lacuna.create_lesson',
        input: { courseId: course.id, name: 'Cells' },
        agentId: 'agent',
        grant: { courseId: 'another-course', scope: 'write', grantedAt: 1 },
      },
      reply,
      {},
    );

    expect(reply).toHaveBeenCalledWith({
      id: 'one',
      ok: false,
      error: {
        kind: 'forbidden',
        message: 'The MCP invocation grant does not match the requested tool scope.',
      },
    });
    expect(await db.lessons.count()).toBe(0);
  });

  it('adapts a successful executor result to the existing IPC envelope', async () => {
    const grant = {
      courseId: '__global__',
      scope: 'read' as const,
      grantedAt: 42,
      label: 'All Lacuna data',
    };
    const reply = vi.fn<(response: McpInvokeResponse) => void>();

    await invokeThroughPreload(
      { id: 'one', tool: 'lacuna.list_courses', input: {}, agentId: 'agent', grant },
      reply,
      {},
    );

    expect(reply).toHaveBeenCalledWith({ id: 'one', ok: true, result: [] });
  });

  it('keeps destructive undo available to the renderer while stripping it from IPC', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const undo = vi.fn();
    const reply = vi.fn<(response: McpInvokeResponse) => void>();

    await invokeThroughPreload(
      {
        id: 'one',
        tool: 'lacuna.delete_lesson',
        input: { lessonId: lesson.id },
        agentId: 'agent',
        grant: { courseId: course.id, scope: 'destructive', grantedAt: 1 },
      },
      reply,
      { onUndoAvailable: undo },
    );

    expect(reply).toHaveBeenCalledWith({ id: 'one', ok: true, result: { id: lesson.id } });
    expect(undo).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'one',
        toolName: 'lacuna.delete_lesson',
        payload: expect.objectContaining({ kind: 'restoreLesson' }),
      }),
    );
  });
});
