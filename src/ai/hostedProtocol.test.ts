import { describe, expect, it } from 'vitest';
import { AI_TEACHING_INSTRUCTION_VERSION } from './instructions';
import {
  MAX_HOSTED_REQUEST_BYTES,
  decodeHostedEvents,
  encodeHostedEvent,
  parseHostedRequest,
} from './hostedProtocol';

const request = {
  version: 1,
  conversationId: 'conversation-1',
  runId: 'run-1',
  step: 0,
  teaching: {
    instructionVersion: AI_TEACHING_INSTRUCTION_VERSION,
    misconceptionFirstEnabled: true,
  },
  messages: [{ role: 'user', content: 'Explain this card.' }],
};

describe('hosted inference contract', () => {
  it('accepts a bounded first step and rejects client model selection and oversized payloads', () => {
    expect(parseHostedRequest(JSON.stringify(request))).toEqual(request);
    expect(() =>
      parseHostedRequest(JSON.stringify({ ...request, model: 'other/model' })),
    ).toThrow();
    expect(() => parseHostedRequest(JSON.stringify({ ...request, version: 2 }))).toThrow();
    expect(() => parseHostedRequest('x'.repeat(MAX_HOSTED_REQUEST_BYTES + 1))).toThrow();
  });

  it('requires an exact tool call and result association for a continuation', () => {
    const continuation = {
      ...request,
      step: 1,
      messages: [
        ...request.messages,
        {
          role: 'tool_call',
          callId: 'call-1',
          name: 'lacuna.search_cards',
          input: { query: 'cell' },
        },
        { role: 'tool_result', callId: 'call-1', result: { ok: true } },
      ],
    };
    expect(parseHostedRequest(JSON.stringify(continuation))).toEqual(continuation);
    expect(() =>
      parseHostedRequest(
        JSON.stringify({
          ...continuation,
          messages: continuation.messages.map((message) =>
            message.role === 'tool_result' ? { ...message, callId: 'different' } : message,
          ),
        }),
      ),
    ).toThrow();
  });

  it('decodes stream events across network chunk boundaries and rejects invalid events', async () => {
    const encoded =
      encodeHostedEvent({ type: 'text_delta', text: 'Hello' }) +
      encodeHostedEvent({ type: 'completed', finishReason: 'stop' });
    const bytes = new TextEncoder().encode(encoded);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7, 19));
        controller.enqueue(bytes.slice(19));
        controller.close();
      },
    });
    const events = [];
    for await (const event of decodeHostedEvents(stream)) events.push(event);
    expect(events).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'completed', finishReason: 'stop' },
    ]);
    expect(() =>
      encodeHostedEvent({ type: 'tool_call', callId: 'x', name: 'bad', input: {} }),
    ).toThrow();
  });
});
