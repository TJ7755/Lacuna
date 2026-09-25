import { MAX_HOSTED_REQUEST_BYTES, type HostedRequest } from '../hostedProtocol';

const encoder = new TextEncoder();

/** Keep the newest complete turns and tool exchanges within the wire limit. */
export function budgetHostedRequest(request: HostedRequest): HostedRequest {
  const messages = [...request.messages];
  const fits = () => messages.length <= 24 &&
    encoder.encode(JSON.stringify({ ...request, messages })).byteLength <= MAX_HOSTED_REQUEST_BYTES;

  while (!fits()) {
    const nextUser = messages.findIndex((message, index) => index > 0 && message.role === 'user');
    if (nextUser > 0) {
      messages.splice(0, nextUser);
      continue;
    }
    if (messages.length > 3 && messages[1]?.role === 'tool_call' && messages[2]?.role === 'tool_result') {
      messages.splice(1, 2);
      continue;
    }
    if (messages.length > 2 && messages[1]?.role === 'assistant') {
      messages.splice(1, 1);
      continue;
    }
    const first = messages[0];
    if (first?.role !== 'user' || first.content.length <= 1) {
      throw new Error('The AI request exceeds its limit.');
    }
    const characters = Array.from(first.content);
    let low = 1;
    let high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      messages[0] = { ...first, content: characters.slice(-middle).join('') };
      if (fits()) low = middle;
      else high = middle - 1;
    }
    messages[0] = { ...first, content: characters.slice(-low).join('') };
    if (!fits()) throw new Error('The AI request exceeds its limit.');
  }
  return { ...request, messages };
}
