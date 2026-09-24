import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { decodeHostedEvents } from '../src/ai/hostedProtocol';
import { AI_TEACHING_INSTRUCTION_VERSION } from '../src/ai/instructions';
import { createHostedSpikeResponse, toModelMessages } from '../server/ai/spike';

const request = {
  version: 1,
  conversationId: 'conversation-1',
  runId: 'run-1',
  step: 0,
  teaching: {
    instructionVersion: AI_TEACHING_INSTRUCTION_VERSION,
    misconceptionFirstEnabled: false,
  },
  messages: [{ role: 'user', content: 'Find my Biology course.' }],
} as const;

describe('local Gateway spike', () => {
  it('streams SDK text and a complete tool request without executing local data tools', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text-1' });
            controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'I will look it up.' });
            controller.enqueue({ type: 'text-end', id: 'text-1' });
            controller.enqueue({
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'lacuna.find_course',
              input: '{"query":"Biology"}',
            });
            controller.close();
          },
        }),
      }),
    });
    const response = createHostedSpikeResponse(JSON.stringify(request), model);
    expect(response.status).toBe(200);
    const events = [];
    for await (const event of decodeHostedEvents(response.body!)) events.push(event);
    expect(events).toEqual([
      { type: 'text_delta', text: 'I will look it up.' },
      {
        type: 'tool_call',
        callId: 'call-1',
        name: 'lacuna.find_course',
        input: { query: 'Biology' },
      },
      { type: 'completed', finishReason: 'tool_calls' },
    ]);
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it('keeps continuation tool calls and results associated in SDK messages', () => {
    const messages = toModelMessages({
      ...request,
      step: 1,
      messages: [
        ...request.messages,
        {
          role: 'tool_call',
          callId: 'call-1',
          name: 'lacuna.find_course',
          input: { query: 'Biology' },
        },
        { role: 'tool_result', callId: 'call-1', result: { ok: true, courses: [] } },
      ],
    });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: [{ toolCallId: 'call-1' }] });
    expect(messages[2]).toMatchObject({ role: 'tool', content: [{ toolCallId: 'call-1' }] });
  });

  it('rejects a client model override before invoking the SDK', () => {
    const model = new MockLanguageModelV4();
    const response = createHostedSpikeResponse(
      JSON.stringify({ ...request, model: 'other/model' }),
      model,
    );
    expect(response.status).toBe(400);
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('reports provider failure without claiming completion', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error('Sensitive provider detail');
      },
    });
    const response = createHostedSpikeResponse(JSON.stringify(request), model);
    const events = [];
    for await (const event of decodeHostedEvents(response.body!)) events.push(event);
    expect(events).toEqual([
      { type: 'error', kind: 'provider', message: 'Inference is unavailable. Try again later.' },
    ]);
  });
});
