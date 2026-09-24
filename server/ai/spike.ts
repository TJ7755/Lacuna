import { streamText, tool, type LanguageModel, type ModelMessage } from 'ai';
import {
  parseHostedRequest,
  encodeHostedEvent,
  type HostedRequest,
} from '../../src/ai/hostedProtocol';
import { buildAiInstructionBundle } from '../../src/ai/instructions';
import { findCourseContract } from '../../src/mcp/contracts/read';

const spikeTools = {
  [findCourseContract.name]: tool({
    description: findCourseContract.description,
    inputSchema: findCourseContract.inputSchema,
  }),
};

export function toModelMessages(request: HostedRequest): ModelMessage[] {
  const messages: ModelMessage[] = [];
  const callNames = new Map<string, string>();
  for (const message of request.messages) {
    if (message.role === 'user' || message.role === 'assistant') {
      messages.push({ role: message.role, content: message.content });
    } else if (message.role === 'tool_call') {
      callNames.set(message.callId, message.name);
      messages.push({
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: message.callId,
            toolName: message.name,
            input: message.input,
          },
        ],
      });
    } else {
      messages.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: message.callId,
            toolName: callNames.get(message.callId)!,
            output: { type: 'json', value: message.result },
          },
        ],
      });
    }
  }
  return messages;
}

/** Local-only inference harness. Admission and durable quotas precede any public function. */
export function createHostedSpikeResponse(
  body: string,
  model: LanguageModel,
  signal?: AbortSignal,
): Response {
  let request: HostedRequest;
  try {
    request = parseHostedRequest(body);
  } catch {
    return new Response('Invalid hosted request.', { status: 400 });
  }
  const instructions = buildAiInstructionBundle(request.teaching);
  const result = streamText({
    model,
    system: instructions.content,
    messages: toModelMessages(request),
    tools: spikeTools,
    maxOutputTokens: 256,
    maxRetries: 0,
    abortSignal: signal,
  });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let calledTool = false;
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            for (let offset = 0; offset < part.text.length; offset += 4_000) {
              controller.enqueue(
                encoder.encode(
                  encodeHostedEvent({
                    type: 'text_delta',
                    text: part.text.slice(offset, offset + 4_000),
                  }),
                ),
              );
            }
          } else if (part.type === 'tool-call') {
            calledTool = true;
            controller.enqueue(
              encoder.encode(
                encodeHostedEvent({
                  type: 'tool_call',
                  callId: part.toolCallId,
                  name: part.toolName,
                  input: part.input,
                }),
              ),
            );
          } else if (part.type === 'error') {
            throw new Error('Provider stream failed.');
          }
        }
        controller.enqueue(
          encoder.encode(
            encodeHostedEvent({
              type: 'completed',
              finishReason: calledTool ? 'tool_calls' : 'stop',
            }),
          ),
        );
      } catch {
        controller.enqueue(
          encoder.encode(
            encodeHostedEvent({
              type: 'error',
              kind: 'provider',
              message: 'Inference is unavailable. Try again later.',
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
