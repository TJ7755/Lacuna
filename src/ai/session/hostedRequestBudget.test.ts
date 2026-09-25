import { expect, it } from 'vitest';
import { HOSTED_PROTOCOL_VERSION, parseHostedRequest, type HostedRequest } from '../hostedProtocol';
import { AI_TEACHING_INSTRUCTION_VERSION } from '../instructions';
import { budgetHostedRequest } from './hostedRequestBudget';

it('bounds multibyte continuation requests while retaining the final tool exchange', () => {
  const messages: HostedRequest['messages'] = [
    { role: 'user', content: 'Previous question' },
    { role: 'assistant', content: '界'.repeat(12_000) },
    { role: 'user', content: '界'.repeat(12_000) },
  ];
  for (let index = 0; index < 4; index += 1) {
    messages.push({ role: 'assistant', content: '界'.repeat(12_000) },
      { role: 'tool_call', callId: `call-${index}`, name: 'lacuna.create_course', input: { name: 'Course' } },
      { role: 'tool_result', callId: `call-${index}`, result: { ok: true } });
  }
  const request: HostedRequest = { version: HOSTED_PROTOCOL_VERSION, conversationId: 'conversation',
    runId: 'run', step: 4, teaching: { instructionVersion: AI_TEACHING_INSTRUCTION_VERSION,
      misconceptionFirstEnabled: true }, messages };
  expect(() => parseHostedRequest(JSON.stringify(request))).toThrow('too large');
  const bounded = budgetHostedRequest(request);
  expect(parseHostedRequest(JSON.stringify(bounded))).toEqual(bounded);
  expect(bounded.messages.at(-2)).toMatchObject({ role: 'tool_call', callId: 'call-3' });
  expect(bounded.messages.at(-1)).toMatchObject({ role: 'tool_result', callId: 'call-3' });
  expect(bounded.messages[0].role).toBe('user');
});
