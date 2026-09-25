import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { decodeHostedEvents } from '../../src/ai/hostedProtocol';
import { createHostedInferenceResponse, hostedModelMessages } from './inference';

const request = {
  version: 1,
  conversationId: 'conversation-1',
  runId: 'run-1',
  step: 0,
  teaching: { instructionVersion: 'teaching-v1', misconceptionFirstEnabled: false },
  messages: [{ role: 'user', content: 'Find my Biology course.' }],
} as const;

async function events(response: Response) {
  const result = [];
  for await (const event of decodeHostedEvents(response.body!)) result.push(event);
  return result;
}

describe('hosted AI inference', () => {
  it('maps generic model tools to validated Lacuna tool requests and preserves continuation', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'tool-call', toolCallId: 'call-1',
              toolName: 'lacuna_invoke_tool',
              input: JSON.stringify({ name: 'lacuna.find_course', input: { query: 'Biology' } }) });
            controller.close();
          },
        }),
      }),
    });
    expect(await events(createHostedInferenceResponse(JSON.stringify(request), [{ id: 'free', model }], new AbortController().signal)))
      .toEqual([
        { type: 'tool_call', callId: 'call-1', name: 'lacuna.find_course', input: { query: 'Biology' } },
        { type: 'completed', finishReason: 'tool_calls' },
      ]);
    const messages = hostedModelMessages({ ...request, step: 1, messages: [
      ...request.messages,
      { role: 'tool_call', callId: 'call-1', name: 'lacuna.find_course', input: { query: 'Biology' } },
      { role: 'tool_result', callId: 'call-1', result: { ok: true, courses: [] } },
    ] });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: [{ toolName: 'lacuna_invoke_tool', input: { name: 'lacuna.find_course' } }] });
    expect(messages[2]).toMatchObject({ role: 'tool', content: [{ toolName: 'lacuna_invoke_tool' }] });
  });

  it('falls back only before any visible output and keeps provider errors private', async () => {
    const failed = new MockLanguageModelV4({ doStream: async () => { throw new Error('private upstream detail'); } });
    const working = new MockLanguageModelV4({
      doStream: async () => ({ stream: new ReadableStream({ start(controller) {
        controller.enqueue({ type: 'text-start', id: 'text-1' });
        controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'Found it.' });
        controller.enqueue({ type: 'text-end', id: 'text-1' });
        controller.close();
      } }) }),
    });
    expect(await events(createHostedInferenceResponse(JSON.stringify(request), [
      { id: 'first', model: failed }, { id: 'second', model: working },
    ], new AbortController().signal))).toEqual([
      { type: 'text_delta', text: 'Found it.' },
      { type: 'completed', finishReason: 'stop' },
    ]);
    expect(working.doStreamCalls).toHaveLength(1);
  });

  it('rejects arbitrary model selection before invoking a provider', () => {
    const model = new MockLanguageModelV4();
    const response = createHostedInferenceResponse(JSON.stringify({ ...request, model: 'paid/model' }),
      [{ id: 'free', model }], new AbortController().signal);
    expect(response.status).toBe(400);
    expect(model.doStreamCalls).toHaveLength(0);
  });
});
