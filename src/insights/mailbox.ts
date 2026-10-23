import { normaliseRelayUrl } from '../sync/relay';
import { isoDayStartMs } from '../../relay/shared/insights/index';
import {
  INSIGHT_ID_RE,
  INSIGHT_MAX_ENVELOPE_BYTES,
  INSIGHT_PAGE_SIZE,
  parseInsightEnvelope,
  parseInsightMailboxPage,
  type InsightEnvelope,
  type InsightMailboxPage,
} from '../../relay/shared/insights/index';

interface MailboxOptions {
  relayUrl: string;
  shareId: string;
  isoDay: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class InsightsMailboxError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'InsightsMailboxError';
  }
}

/** Retry the same slot and ciphertext after a lost acknowledgement; do not reseal it. */
export async function putInsightEnvelope(
  options: MailboxOptions & { slotId: string; envelope: InsightEnvelope },
): Promise<void> {
  const url = mailboxUrl(options);
  if (!INSIGHT_ID_RE.test(options.slotId)) throw new InsightsMailboxError('Invalid insights slot.');
  const body = JSON.stringify(parseInsightEnvelope(options.envelope, options));
  if (new TextEncoder().encode(body).byteLength > INSIGHT_MAX_ENVELOPE_BYTES)
    throw new InsightsMailboxError('Insights envelope is too large.');
  await request(
    options,
    `${url}/${options.slotId}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body },
    204,
  );
}

export async function getInsightMailboxPage(
  options: MailboxOptions & { writeToken: string; cursor?: string },
): Promise<InsightMailboxPage> {
  const url = mailboxUrl(options);
  if (!/^[0-9a-f]{64}$/.test(options.writeToken))
    throw new InsightsMailboxError('Invalid insights owner token.');
  if (options.cursor !== undefined && (!options.cursor || options.cursor.length > 2048))
    throw new InsightsMailboxError('Invalid insights cursor.');
  const raw = await request(
    options,
    `${url}${options.cursor ? `?cursor=${encodeURIComponent(options.cursor)}` : ''}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${options.writeToken}` },
    },
    200,
  );
  try {
    return parseInsightMailboxPage(raw, options);
  } catch {
    throw new InsightsMailboxError('The insights service returned an unreadable page.');
  }
}

function mailboxUrl(options: MailboxOptions): string {
  if (!INSIGHT_ID_RE.test(options.shareId))
    throw new InsightsMailboxError('Invalid insights course.');
  isoDayStartMs(options.isoDay);
  return `${normaliseRelayUrl(options.relayUrl)}/insights/${options.shareId}/${options.isoDay}`;
}

async function request(
  options: MailboxOptions,
  url: string,
  init: RequestInit,
  expected: number,
): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (response.status !== expected)
      throw new InsightsMailboxError(
        `The insights service returned HTTP ${response.status}.`,
        response.status,
      );
    if (expected === 204) return undefined;
    try {
      return JSON.parse(await readPageText(response));
    } catch {
      throw new InsightsMailboxError('The insights service returned an unreadable page.');
    }
  } catch (error) {
    if (error instanceof InsightsMailboxError) throw error;
    throw new InsightsMailboxError('Could not reach the insights service. Try again later.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function readPageText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing page.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0,
    text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > INSIGHT_PAGE_SIZE * INSIGHT_MAX_ENVELOPE_BYTES + 4096) {
        await reader.cancel();
        throw new Error('Oversized page.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
