import { streamText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { aiToolNameSchema } from '../../src/ai/protocol.js';
import {
  encodeHostedEvent,
  parseHostedRequest,
  type HostedRequest,
} from '../../src/ai/hostedProtocol.js';
import { buildAiInstructionBundle } from '../../src/ai/instructions.js';
import { listToolsContract } from '../../src/mcp/contracts/registry.js';
import type { HostedModelRoute } from './providers';

const hostedTools = {
  lacuna_list_tools: tool({
    description: listToolsContract.description,
    inputSchema: listToolsContract.inputSchema.extend({
      limit: z.number().int().min(1).max(5).default(5),
    }),
  }),
  lacuna_invoke_tool: tool({
    description: 'Invoke a Lacuna domain tool by its catalogue name and validated input. Lacuna resolves read and write permissions locally.',
    inputSchema: z.object({ name: aiToolNameSchema, input: z.record(z.string(), z.any()) }).strict(),
  }),
};

export function hostedModelMessages(request: HostedRequest): ModelMessage[] {
  const messages: ModelMessage[] = [];
  const callNames = new Map<string, string>();
  for (const message of request.messages) {
    if (message.role === 'user' || message.role === 'assistant') {
      messages.push({ role: message.role, content: message.content });
    } else if (message.role === 'tool_call') {
      const toolName = message.name === 'lacuna.list_tools' ? 'lacuna_list_tools' : 'lacuna_invoke_tool';
      callNames.set(message.callId, toolName);
      messages.push({
        role: 'assistant',
        content: [{
          type: 'tool-call', toolCallId: message.callId, toolName,
          input: toolName === 'lacuna_list_tools' ? message.input : { name: message.name, input: message.input },
        }],
      });
    } else {
      messages.push({
        role: 'tool',
        content: [{
          type: 'tool-result', toolCallId: message.callId,
          toolName: callNames.get(message.callId)!,
          output: { type: 'json', value: message.result },
        }],
      });
    }
  }
  return messages;
}

export function createHostedInferenceResponse(
  body: string,
  routes: readonly HostedModelRoute[],
  signal: AbortSignal,
): Response {
  let request: HostedRequest;
  try {
    request = parseHostedRequest(body);
  } catch {
    return new Response('Invalid hosted request.', { status: 400 });
  }
  if (routes.length === 0) return new Response('AI is unavailable.', { status: 503 });
  const instructions = buildAiInstructionBundle(request.teaching);
  const messages = hostedModelMessages(request);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let finished = false;
      const emit = (event: unknown) => controller.enqueue(encoder.encode(encodeHostedEvent(event)));
      try {
        for (const route of routes) {
          if (signal.aborted) break;
          let visible = false;
          let calledTool = false;
          try {
            const result = streamText({
              model: route.model,
              system: instructions.content,
              messages,
              tools: hostedTools,
              maxOutputTokens: 768,
              maxRetries: 0,
              abortSignal: signal,
            });
            for await (const part of result.fullStream) {
              if (signal.aborted) throw new Error('Inference was stopped.');
              if (part.type === 'text-delta') {
                visible = true;
                for (let offset = 0; offset < part.text.length; offset += 4_000) {
                  emit({ type: 'text_delta', text: part.text.slice(offset, offset + 4_000) });
                }
              } else if (part.type === 'tool-call') {
                const input = part.input as unknown;
                if (part.toolName === 'lacuna_list_tools') {
                  emit({ type: 'tool_call', callId: part.toolCallId, name: 'lacuna.list_tools', input });
                } else if (part.toolName === 'lacuna_invoke_tool' &&
                    input && typeof input === 'object' && 'name' in input && 'input' in input) {
                  const call = input as { name: unknown; input: unknown };
                  emit({ type: 'tool_call', callId: part.toolCallId, name: call.name, input: call.input });
                } else {
                  throw new Error('Invalid model tool call.');
                }
                visible = true;
                calledTool = true;
              } else if (part.type === 'error') {
                throw new Error('Provider stream failed.');
              }
            }
            emit({ type: 'completed', finishReason: calledTool ? 'tool_calls' : 'stop' });
            finished = true;
            break;
          } catch (error) {
            console.error('Hosted AI route failed', {
              route: route.id,
              name: error instanceof Error ? error.name : typeof error,
              message: error instanceof Error ? error.message : 'Unknown provider error',
            });
            if (visible || signal.aborted) break;
          }
        }
        if (!finished && !signal.aborted) {
          emit({ type: 'error', kind: 'provider', message: 'Inference is unavailable. Try again later.' });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
