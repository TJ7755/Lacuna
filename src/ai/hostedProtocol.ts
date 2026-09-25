import { z } from 'zod';
import { MAX_AI_IDENTIFIER_LENGTH, aiToolNameSchema, boundedJsonValueSchema } from './protocol.js';
import { AI_TEACHING_INSTRUCTION_VERSION } from './instructions.js';

export const HOSTED_PROTOCOL_VERSION = 1 as const;
export const MAX_HOSTED_REQUEST_BYTES = 96 * 1024;
const MAX_HOSTED_EVENT_BYTES = 64 * 1024;
const MAX_HOSTED_MESSAGES = 24;
const MAX_HOSTED_TEXT_LENGTH = 12_000;

const identifier = z
  .string()
  .min(1)
  .max(MAX_AI_IDENTIFIER_LENGTH)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().min(1).max(MAX_HOSTED_TEXT_LENGTH);
const messageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: text }).strict(),
  z.object({ role: z.literal('assistant'), content: text }).strict(),
  z
    .object({
      role: z.literal('tool_call'),
      callId: identifier,
      name: aiToolNameSchema,
      input: boundedJsonValueSchema,
    })
    .strict(),
  z
    .object({ role: z.literal('tool_result'), callId: identifier, result: boundedJsonValueSchema })
    .strict(),
]);

export const hostedRequestSchema = z
  .object({
    version: z.literal(HOSTED_PROTOCOL_VERSION),
    conversationId: identifier,
    runId: identifier,
    step: z.number().int().min(0).max(8),
    teaching: z
      .object({
        instructionVersion: z.literal(AI_TEACHING_INSTRUCTION_VERSION),
        misconceptionFirstEnabled: z.boolean(),
      })
      .strict(),
    messages: z.array(messageSchema).min(1).max(MAX_HOSTED_MESSAGES),
  })
  .strict()
  .superRefine((request, context) => {
    const pending = new Set<string>();
    const used = new Set<string>();
    for (const [index, message] of request.messages.entries()) {
      if (index === 0 && message.role !== 'user') {
        context.addIssue({ code: 'custom', message: 'History must begin with a user message.' });
      }
      if (message.role === 'tool_call') {
        if (used.has(message.callId)) {
          context.addIssue({ code: 'custom', message: 'Tool call IDs must be unique.' });
        }
        used.add(message.callId);
        pending.add(message.callId);
      } else if (message.role === 'tool_result') {
        if (!pending.delete(message.callId)) {
          context.addIssue({ code: 'custom', message: 'Tool result has no matching call.' });
        }
      }
    }
    if (pending.size > 0) {
      context.addIssue({ code: 'custom', message: 'Every tool call needs its result.' });
    }
    const lastRole = request.messages.at(-1)?.role;
    if (request.step === 0 ? lastRole !== 'user' : lastRole !== 'tool_result') {
      context.addIssue({ code: 'custom', message: 'Step does not match the final message.' });
    }
    if (request.step === 0 && used.size > 0) {
      context.addIssue({ code: 'custom', message: 'The first step cannot contain tool calls.' });
    }
  });

export type HostedRequest = z.infer<typeof hostedRequestSchema>;

export const hostedEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_delta'), text: z.string().min(1).max(4_000) }).strict(),
  z
    .object({
      type: z.literal('tool_call'),
      callId: identifier,
      name: aiToolNameSchema,
      input: boundedJsonValueSchema,
    })
    .strict(),
  z.object({ type: z.literal('completed'), finishReason: z.enum(['stop', 'tool_calls']) }).strict(),
  z
    .object({
      type: z.literal('error'),
      kind: z.enum(['unavailable', 'quota', 'invalid_request', 'provider']),
      message: z.string().min(1).max(500),
    })
    .strict(),
]);

export type HostedEvent = z.infer<typeof hostedEventSchema>;

export function parseHostedRequest(body: string): HostedRequest {
  if (new TextEncoder().encode(body).byteLength > MAX_HOSTED_REQUEST_BYTES) {
    throw new Error('Hosted request is too large.');
  }
  return hostedRequestSchema.parse(JSON.parse(body) as unknown);
}

export function encodeHostedEvent(event: unknown): string {
  const encoded = `${JSON.stringify(hostedEventSchema.parse(event))}\n`;
  if (new TextEncoder().encode(encoded).byteLength > MAX_HOSTED_EVENT_BYTES) {
    throw new Error('Hosted event is too large.');
  }
  return encoded;
}

/** Newline-delimited events retain their boundaries across arbitrary HTTP chunks. */
export async function* decodeHostedEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<HostedEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let end = pending.indexOf('\n');
      while (end !== -1) {
        const line = pending.slice(0, end);
        if (new TextEncoder().encode(line).byteLength > MAX_HOSTED_EVENT_BYTES) {
          throw new Error('Hosted event is too large.');
        }
        yield hostedEventSchema.parse(JSON.parse(line) as unknown);
        pending = pending.slice(end + 1);
        end = pending.indexOf('\n');
      }
      if (new TextEncoder().encode(pending).byteLength > MAX_HOSTED_EVENT_BYTES) {
        throw new Error('Hosted event is too large.');
      }
    }
    pending += decoder.decode();
    if (pending.length > 0) throw new Error('Hosted event stream ended mid-event.');
  } finally {
    reader.releaseLock();
  }
}
