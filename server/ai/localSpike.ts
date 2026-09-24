import { createServer } from 'node:http';
import type { LanguageModel } from 'ai';
import { MAX_HOSTED_REQUEST_BYTES } from '../../src/ai/hostedProtocol';
import { createHostedSpikeResponse } from './spike';

const modelName = process.env.AI_GATEWAY_SPIKE_MODEL;
const accessToken = process.env.AI_GATEWAY_SPIKE_TOKEN;
if (!process.env.AI_GATEWAY_API_KEY || !modelName || !accessToken || accessToken.length < 32) {
  throw new Error(
    'Set AI_GATEWAY_API_KEY, AI_GATEWAY_SPIKE_MODEL and a 32-character AI_GATEWAY_SPIKE_TOKEN.',
  );
}
if (!/^[a-z0-9-]+\/[a-zA-Z0-9._-]+$/.test(modelName)) {
  throw new Error('AI_GATEWAY_SPIKE_MODEL must be a Gateway model ID.');
}

const server = createServer(async (incoming, outgoing) => {
  if (incoming.method !== 'POST' || incoming.url !== '/inference') {
    outgoing.writeHead(404).end();
    return;
  }
  if (incoming.headers.authorization !== `Bearer ${accessToken}` || incoming.headers.origin) {
    outgoing.writeHead(401).end();
    return;
  }
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of incoming) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += bytes.byteLength;
    if (byteLength > MAX_HOSTED_REQUEST_BYTES) {
      outgoing.writeHead(413).end();
      return;
    }
    chunks.push(bytes);
  }
  const disconnected = new AbortController();
  outgoing.on('close', () => disconnected.abort());
  const response = createHostedSpikeResponse(
    Buffer.concat(chunks).toString('utf8'),
    modelName as LanguageModel,
    AbortSignal.any([disconnected.signal, AbortSignal.timeout(30_000)]),
  );
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    for await (const chunk of response.body) outgoing.write(Buffer.from(chunk));
  }
  outgoing.end();
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') {
    process.stdout.write(`Local AI Gateway spike listening on 127.0.0.1:${address.port}\n`);
  }
});
