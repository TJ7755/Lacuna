import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createAiToolSession } from '../ai/toolSession';
import { getTool, unknownToolMessage, validateAndRun } from './registry';

describe('lacuna.list_tools', () => {
  it('rejects overlong suggestion input without reflecting it into the response', () => {
    const overlongName = `lacuna.${'x'.repeat(10_000)}`;
    const message = unknownToolMessage(overlongName);

    expect(message).toBe('Unknown tool name is too long. Use lacuna.list_tools to search the catalogue.');
    expect(message).not.toContain(overlongName);
  });

  it('returns searchable schemas and permission levels through the generic AI invoker', async () => {
    const tool = getTool('lacuna.list_tools');
    expect(tool).toBeDefined();

    const result = await validateAndRun(
      tool!,
      { query: 'course', limit: 2 },
      { grant: null, agentId: 'test-agent' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const data = result.result.data as {
      tools: Array<Record<string, unknown>>;
      nextCursor?: string;
    };
    expect(data.tools).toHaveLength(2);
    expect(data.tools[0]).toMatchObject({
      name: expect.stringMatching(/^lacuna\./),
      description: expect.any(String),
      requiredScope: expect.stringMatching(/^(read|write|destructive)$/),
      inputSchema: expect.any(Object),
    });
    expect(data.nextCursor).toEqual(expect.any(String));
  });

  it('rejects a catalogue cursor reused with another query', async () => {
    const tool = getTool('lacuna.list_tools');
    expect(tool).toBeDefined();
    const first = await validateAndRun(
      tool!,
      { query: '', limit: 1 },
      { grant: null, agentId: 'test-agent' },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error.message);
    const cursor = (first.result.data as { nextCursor: string }).nextCursor;

    const reused = await validateAndRun(
      tool!,
      { query: 'course', limit: 1, cursor },
      { grant: null, agentId: 'test-agent' },
    );

    expect(reused).toMatchObject({
      ok: false,
      error: { kind: 'validation', message: 'The tool catalogue cursor is invalid.' },
    });
  });

  it('crosses the complete local AI permission and execution boundary', async () => {
    const session = createAiToolSession({
      now: () => 100,
      createId: () => 'generated-id',
      digest: async (value) => value,
    });

    const outcome = await session.invoke({
      connectionId: 'connection-1',
      runId: 'run-1',
      runStatus: 'active',
      callId: 'catalogue-call-1',
      toolName: 'lacuna.list_tools',
      input: { query: 'course', limit: 5 },
    });

    expect(outcome.response).toMatchObject({
      ok: true,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'lacuna.find_course', requiredScope: 'read' }),
        ]),
      },
    });
  });
});
