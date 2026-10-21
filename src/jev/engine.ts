import {
  createHostedTransport,
  HOSTED_ACCESS_STORAGE_KEY,
  HostedTransportError,
} from '../ai/session/hostedTransport';
import { HOSTED_SERVICE_ORIGIN } from '../config/origins';
import { decisionHash, jevDecisionCache, type JevDecisionCache } from './cache';
import {
  jevDecisionRequestSchema,
  jevDecisionResultSchema,
  jevAllocationBatchResultSchema,
  jevAllocationBatchRequestSchema,
  type JevAllocationInput,
  type JevDecisionRequest,
  type JevDecisionResult,
  JEV_ALLOCATION_CONFIDENCE_THRESHOLD,
  JEV_TYPED_CORRECT_THRESHOLD,
  JEV_TYPED_INCORRECT_THRESHOLD,
} from './protocol';
import {
  JEV_CONSENT_VERSION,
  JEV_TYPED_TIMEOUT_MS,
  type JevSettings,
  type JevStatus,
  type JevPauseReason,
  type JevTypedAnswerRequest,
  type JevTypedVerdict,
} from './types';

export const JEV_SETTINGS_STORAGE_KEY = 'lacuna.jevSettings';
const off: JevSettings = { enabled: false, acceptedConsentVersion: null };
class Pause extends Error {
  constructor(readonly reason: JevPauseReason) {
    super(reason);
  }
}
export function createJevEngine(
  options: { fetcher?: typeof fetch; storage?: Storage; cache?: JevDecisionCache } = {},
) {
  let storage: Storage | undefined;
  try {
    storage = options.storage ?? globalThis.localStorage;
  } catch {
    /* Storage denial means off. */
  }
  const fetcher: typeof fetch = options.fetcher ?? ((...args) => globalThis.fetch(...args));
  const transport = createHostedTransport(fetcher);
  const cache = options.cache ?? jevDecisionCache;
  const listeners = new Set<() => void>();
  const readCode = () => {
    try {
      return storage?.getItem(HOSTED_ACCESS_STORAGE_KEY)?.trim() || '';
    } catch {
      return '';
    }
  };
  const readSettings = (): JevSettings => {
    try {
      const value = JSON.parse(storage?.getItem(JEV_SETTINGS_STORAGE_KEY) ?? 'null');
      if (
        typeof value?.enabled === 'boolean' &&
        (value.acceptedConsentVersion === null || Number.isInteger(value.acceptedConsentVersion))
      ) {
        return {
          enabled: value.enabled && value.acceptedConsentVersion === JEV_CONSENT_VERSION,
          acceptedConsentVersion: value.acceptedConsentVersion,
        };
      }
    } catch {
      /* Invalid or unavailable local storage means off. */
    }
    return off;
  };
  let settings = readSettings();
  let status: JevStatus = { state: 'off' };
  let lastUsedAt: number | null = null;
  let pause: JevPauseReason | null = null;
  let consecutiveFailures = 0;
  let retryAt: number | null = null;
  let backoffStep = 0;
  let generation = new AbortController();
  let session: { code: string; token: string; expiresAt: number } | null = null;
  let exchange: { code: string; promise: Promise<{ token: string; expiresAt: number }> } | null =
    null;
  const publish = (notify = true) => {
    const next: JevStatus = !settings.enabled
      ? { state: 'off' }
      : !readCode()
        ? { state: 'paused', reason: 'no-access-code', lastUsedAt }
        : globalThis.navigator?.onLine === false
          ? { state: 'paused', reason: 'offline', lastUsedAt }
          : pause
            ? { state: 'paused', reason: pause, lastUsedAt }
            : { state: 'ready', lastUsedAt };
    if (JSON.stringify(next) !== JSON.stringify(status)) status = next;
    if (notify) listeners.forEach((listener) => listener());
  };
  const stop = () => {
    generation.abort();
    generation = new AbortController();
    exchange = null;
  };
  const save = () => {
    try {
      storage?.setItem(JEV_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      settings = off;
      stop();
    }
    publish();
  };
  const eligible = () =>
    settings.enabled &&
    settings.acceptedConsentVersion === JEV_CONSENT_VERSION &&
    !!readCode() &&
    globalThis.navigator?.onLine !== false &&
    (!pause || (retryAt !== null && Date.now() >= retryAt));
  const reason = (error: unknown): JevPauseReason =>
    error instanceof Pause
      ? error.reason
      : error instanceof HostedTransportError
        ? (
            {
              access: 'access-code-rejected',
              quota: 'limit-reached',
              unavailable: 'service-disabled',
              network: 'offline',
              invalid: 'error',
            } as const
          )[error.kind]
        : globalThis.navigator?.onLine === false
          ? 'offline'
          : 'error';
  const failed = (failure: JevPauseReason) => {
    if (pause === 'access-code-rejected') return;
    consecutiveFailures++;
    if (failure === 'error' && consecutiveFailures < 3) {
      if (pause !== 'service-disabled') {
        publish();
        return;
      }
      failure = 'service-disabled';
    }
    pause = failure;
    if (failure === 'error' || failure === 'service-disabled') {
      retryAt = Date.now() + [60_000, 300_000, 900_000][Math.min(backoffStep, 2)];
      backoffStep++;
    } else if (failure === 'limit-reached') {
      const now = new Date();
      retryAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    } else retryAt = null;
    if (failure === 'access-code-rejected') session = null;
    publish();
  };
  async function token(signal: AbortSignal) {
    const code = readCode();
    if (session?.code === code && session.expiresAt > Date.now() + 5000) return session.token;
    if (!exchange || exchange.code !== code) {
      const pending = { code, promise: transport.exchange(code, generation.signal) };
      exchange = pending;
      void pending.promise
        .finally(() => {
          if (exchange === pending) exchange = null;
        })
        .catch(() => {});
    }
    const result = await exchange.promise;
    signal.throwIfAborted();
    session = { ...result, code };
    return result.token;
  }
  async function guarded<T>(
    externalSignal: AbortSignal | undefined,
    timeout: number,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | null> {
    if (!eligible() || externalSignal?.aborted) {
      publish();
      return null;
    }
    if (pause === 'limit-reached') {
      pause = null;
      retryAt = null;
    }
    const lifetime = generation.signal;
    const controller = new AbortController();
    const signals = [lifetime, ...(externalSignal ? [externalSignal] : [])];
    const abort = () => controller.abort();
    signals.forEach((source) => source.addEventListener('abort', abort, { once: true }));
    const timer = setTimeout(abort, timeout);
    const signal = controller.signal;
    let onAbort: () => void = () => {};
    const aborted = new Promise<null>((resolve) => {
      onAbort = () => resolve(null);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const result = await Promise.race([work(signal), aborted]);
      if (signal.aborted) {
        if (!externalSignal?.aborted && !lifetime.aborted) {
          exchange = null;
          failed('error');
        }
        return null;
      }
      consecutiveFailures = 0;
      backoffStep = 0;
      if (pause === 'error' || pause === 'service-disabled') {
        pause = null;
        retryAt = null;
      }
      publish();
      return result;
    } catch (error) {
      if (!signal.aborted && !lifetime.aborted) {
        failed(reason(error));
      }
      return null;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      signals.forEach((source) => source.removeEventListener('abort', abort));
    }
  }
  function checked(request: JevDecisionRequest, result: JevDecisionResult): JevDecisionResult {
    const maximum = request.purpose === 'typed-equivalence' ? 1 : request.maxMarks;
    const threshold =
      request.purpose === 'mark-allocation'
        ? JEV_ALLOCATION_CONFIDENCE_THRESHOLD
        : result.value === 1
          ? JEV_TYPED_CORRECT_THRESHOLD
          : JEV_TYPED_INCORRECT_THRESHOLD;
    return result.value !== null && (result.value > maximum || result.confidence < threshold)
      ? { ...result, value: null }
      : result;
  }
  async function post(body: unknown, signal: AbortSignal): Promise<unknown> {
    const accessToken = await token(signal);
    signal.throwIfAborted();
    if (!eligible()) return null;
    const origin = globalThis.window?.electronAPI?.isElectron === true ? HOSTED_SERVICE_ORIGIN : '';
    let response: Response;
    try {
      response = await fetcher(`${origin}/api/ai/jev`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (!signal.aborted) throw new Pause('offline');
      throw error;
    }
    if (!response.ok)
      throw new Pause(
        response.status === 401
          ? 'access-code-rejected'
          : response.status === 429
            ? 'limit-reached'
            : response.status === 503
              ? 'service-disabled'
              : 'error',
      );
    return response.json();
  }
  async function decide(
    request: JevDecisionRequest,
    externalSignal?: AbortSignal,
    timeout = 30_000,
  ): Promise<JevDecisionResult | null> {
    return guarded(externalSignal, timeout, async (signal) => {
      const parsed = jevDecisionRequestSchema.parse(request);
      const hash = await decisionHash(parsed);
      signal.throwIfAborted();
      const hit = await cache.get(hash);
      signal.throwIfAborted();
      if (hit) return checked(parsed, hit);
      const result = checked(parsed, jevDecisionResultSchema.parse(await post(parsed, signal)));
      signal.throwIfAborted();
      await cache.put(hash, result);
      signal.throwIfAborted();
      lastUsedAt = Date.now();
      publish();
      return result;
    });
  }
  async function decideAllocations(
    allocations: JevAllocationInput[],
    externalSignal?: AbortSignal,
  ): Promise<JevDecisionResult[] | null> {
    return guarded(externalSignal, 30_000, async (signal) => {
      const parsed = jevAllocationBatchRequestSchema.parse({
        purpose: 'mark-allocation',
        allocations,
      });
      const requests = parsed.allocations.map((allocation) => ({
        purpose: 'mark-allocation' as const,
        ...allocation,
      }));
      const hashes = await Promise.all(requests.map(decisionHash));
      const hits = await Promise.all(hashes.map((hash) => cache.get(hash)));
      signal.throwIfAborted();
      const missing = hits.flatMap((hit, index) => (hit ? [] : [index]));
      if (missing.length) {
        const result = jevAllocationBatchResultSchema.parse(
          await post(
            {
              purpose: 'mark-allocation',
              allocations: missing.map((index) => parsed.allocations[index]),
            },
            signal,
          ),
        );
        if (result.decisions.length !== missing.length) throw new Pause('error');
        signal.throwIfAborted();
        for (const [offset, index] of missing.entries()) {
          // TypeSafe reports usage once for the batch, never per question. Cache entries do not bill.
          hits[index] = checked(requests[index], { ...result.decisions[offset], inputTokens: 0 });
          await cache.put(hashes[index], hits[index]!);
          signal.throwIfAborted();
        }
        lastUsedAt = Date.now();
        publish();
      }
      return hits.map((hit, index) => checked(requests[index], hit!));
    });
  }
  async function markTyped(request: JevTypedAnswerRequest): Promise<JevTypedVerdict> {
    const result = await decide(
      {
        purpose: 'typed-equivalence',
        prompt: request.prompt,
        expected: request.expected,
        answer: request.answer.normalize('NFC').trim().replace(/\s+/g, ' '),
      },
      request.signal,
      JEV_TYPED_TIMEOUT_MS,
    );
    return result !== null && result.value !== null && eligible() && !request.signal?.aborted
      ? {
          outcome: result.value === 1 ? 'correct' : 'incorrect',
          provenance: {
            by: 'jev',
            model: result.model,
            confidence: result.confidence,
            markedAt: Date.now(),
          },
        }
      : { outcome: 'unsure' };
  }
  const controller = {
    enable(version: number) {
      if (version !== JEV_CONSENT_VERSION) return;
      settings = { enabled: true, acceptedConsentVersion: version };
      save();
    },
    disable() {
      stop();
      settings = { ...settings, enabled: false };
      save();
    },
    hasAccessCode: () => !!readCode(),
    async connectAccessCode(code: string): Promise<{ ok: true } | { ok: false; message: string }> {
      if (!settings.enabled || settings.acceptedConsentVersion !== JEV_CONSENT_VERSION)
        return { ok: false, message: new HostedTransportError('invalid').message };
      const signal = generation.signal;
      try {
        const result = await transport.exchange(code.trim(), signal);
        signal.throwIfAborted();
        if (!storage) throw new HostedTransportError('invalid');
        storage.setItem(HOSTED_ACCESS_STORAGE_KEY, code.trim());
        session = { ...result, code: code.trim() };
        pause = null;
        retryAt = null;
        backoffStep = 0;
        consecutiveFailures = 0;
        publish();
        return { ok: true };
      } catch (error) {
        if (!signal.aborted) {
          failed(reason(error));
        }
        return {
          ok: false,
          message:
            error instanceof HostedTransportError
              ? error.message
              : new HostedTransportError('network').message,
        };
      }
    },
  };
  const changed = (event: StorageEvent) => {
    if (
      event.key !== null &&
      event.key !== JEV_SETTINGS_STORAGE_KEY &&
      event.key !== HOSTED_ACCESS_STORAGE_KEY
    )
      return;
    settings = readSettings();
    stop();
    session = null;
    publish();
  };
  const online = () => {
    if (pause === 'offline') pause = null;
    publish();
  };
  publish();
  return {
    ...controller,
    decide,
    decideAllocations,
    markTyped,
    eligible,
    settings: () => settings,
    status: () => {
      publish(false);
      return status;
    },
    marker: () => (eligible() ? markTyped : null),
    subscribe(listener: () => void) {
      if (!listeners.size) {
        globalThis.addEventListener?.('storage', changed);
        globalThis.addEventListener?.('online', online);
        globalThis.addEventListener?.('offline', online);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          globalThis.removeEventListener?.('storage', changed);
          globalThis.removeEventListener?.('online', online);
          globalThis.removeEventListener?.('offline', online);
        }
      };
    },
  };
}
export const jevEngine = createJevEngine();
