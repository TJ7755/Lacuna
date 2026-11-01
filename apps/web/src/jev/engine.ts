import {
  createHostedTransport,
  HostedTransportError,
  hostedLimitError,
} from '../ai/session/hostedTransport';
import { HOSTED_SERVICE_ORIGIN } from '../config/origins';
import { decisionHash, jevDecisionCache, type JevDecisionCache } from './cache';
import { splitJevExpectedAnswer } from './answerParts';
import { checkedDiagnosis, diagnosisMatchesRequest } from './diagnosis';
import {
  jevDecisionRequestSchema,
  jevDecisionResultSchema,
  jevAllocationBatchResultSchema,
  jevAllocationBatchRequestSchema,
  type JevAllocationInput,
  type JevDecisionRequest,
  type JevDecisionResult,
  jevAllocationConfidenceThreshold,
  JEV_TYPED_MAX_PARTS,
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
export const JEV_INSTALLATION_STORAGE_KEY = 'lacuna.jevInstallation';
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
  const readCredential = () => {
    try {
      const credential = storage?.getItem(JEV_INSTALLATION_STORAGE_KEY) ?? '';
      return /^[a-f0-9]{64}$/.test(credential) ? credential : '';
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
          enabled:
            value.enabled &&
            value.acceptedConsentVersion === JEV_CONSENT_VERSION &&
            !!readCredential(),
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
  let session: { credential: string; token: string; expiresAt: number } | null = null;
  let exchange: {
    credential: string;
    promise: Promise<{ token: string; expiresAt: number }>;
  } | null = null;
  let warmedSession: { credential: string; expiresAt: number | null } | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const publish = (notify = true) => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    const waiting = retryAt === null || Date.now() < retryAt;
    if (settings.enabled && listeners.size && retryAt !== null && Date.now() < retryAt) {
      // Wake the UI without issuing a background marking request.
      retryTimer = setTimeout(() => publish(), Math.min(retryAt - Date.now(), 2_147_483_647));
    }
    const next: JevStatus = !settings.enabled
      ? { state: 'off' }
      : globalThis.navigator?.onLine === false
        ? { state: 'paused', reason: 'offline', lastUsedAt }
        : pause && waiting
          ? { state: 'paused', reason: pause, lastUsedAt, retryAt }
          : { state: 'ready', lastUsedAt };
    if (JSON.stringify(next) !== JSON.stringify(status)) status = next;
    if (notify) listeners.forEach((listener) => listener());
  };
  const stop = () => {
    generation.abort();
    generation = new AbortController();
    exchange = null;
    warmedSession = null;
  };
  const save = () => {
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(JEV_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      settings = off;
      stop();
    }
    publish();
  };
  const eligible = () =>
    settings.enabled &&
    settings.acceptedConsentVersion === JEV_CONSENT_VERSION &&
    !!readCredential() &&
    globalThis.navigator?.onLine !== false &&
    (!pause || (retryAt !== null && Date.now() >= retryAt));
  const reason = (error: unknown): JevPauseReason =>
    error instanceof Pause
      ? error.reason
      : error instanceof HostedTransportError
        ? (
            {
              access: 'session-rejected',
              quota: 'limit-reached',
              'rate-limit': 'rate-limited',
              unavailable: 'service-disabled',
              network: globalThis.navigator?.onLine === false ? 'offline' : 'error',
              invalid: 'error',
            } as const
          )[error.kind]
        : globalThis.navigator?.onLine === false
          ? 'offline'
          : 'error';
  const failed = (failure: JevPauseReason, resetAt: number | null = null) => {
    consecutiveFailures++;
    if (failure === 'error' && consecutiveFailures < 3) {
      if (pause !== 'service-disabled') {
        publish();
        return;
      }
      failure = 'service-disabled';
    }
    pause = failure;
    if (failure === 'error' || failure === 'service-disabled' || failure === 'session-rejected') {
      retryAt = Date.now() + [60_000, 300_000, 900_000][Math.min(backoffStep, 2)];
      backoffStep++;
    } else if (failure === 'limit-reached' || failure === 'rate-limited') {
      retryAt = resetAt ?? Date.now() + 60_000;
    } else retryAt = null;
    if (failure === 'session-rejected') {
      session = null;
      warmedSession = null;
    }
    publish();
  };
  async function token(signal: AbortSignal) {
    const credential = readCredential();
    if (session?.credential === credential && session.expiresAt > Date.now() + 5000)
      return session.token;
    if (!exchange || exchange.credential !== credential) {
      const pending = { credential, promise: transport.exchange(credential, generation.signal) };
      exchange = pending;
      void pending.promise
        .finally(() => {
          if (exchange === pending) exchange = null;
        })
        .catch(() => {});
    }
    const result = await exchange.promise;
    signal.throwIfAborted();
    session = { ...result, credential };
    return result.token;
  }
  async function guarded<T>(
    externalSignal: AbortSignal | undefined,
    timeout: number,
    work: (signal: AbortSignal) => Promise<T>,
    countTimeoutAsFailure = true,
  ): Promise<T | null> {
    if (!eligible() || externalSignal?.aborted) {
      publish();
      return null;
    }
    if (pause === 'limit-reached' || pause === 'rate-limited') {
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
        if (!lifetime.aborted) exchange = null;
        if (!externalSignal?.aborted && !lifetime.aborted) {
          if (countTimeoutAsFailure) failed('error');
        }
        return null;
      }
      consecutiveFailures = 0;
      backoffStep = 0;
      if (pause === 'error' || pause === 'service-disabled' || pause === 'session-rejected') {
        pause = null;
        retryAt = null;
      }
      publish();
      return result;
    } catch (error) {
      if (!signal.aborted && !lifetime.aborted) {
        failed(reason(error), error instanceof HostedTransportError ? error.retryAt : null);
      }
      return null;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      signals.forEach((source) => source.removeEventListener('abort', abort));
    }
  }
  function checked(request: JevDecisionRequest, result: JevDecisionResult): JevDecisionResult {
    if (result.diagnosis) {
      if (
        request.purpose !== 'mark-allocation' ||
        !request.diagnostic ||
        !diagnosisMatchesRequest(result.diagnosis, request.diagnostic)
      )
        throw new Pause('error');
      result = { ...result, diagnosis: checkedDiagnosis(result.diagnosis, request.answer) };
    }
    if (request.purpose === 'typed-equivalence' && result.feedback) {
      const split = splitJevExpectedAnswer(request.expected);
      const parts = split.length >= 2 && split.length <= JEV_TYPED_MAX_PARTS ? split : [];
      if (
        parts.length !== result.feedback.parts.length ||
        parts.some(
          (part, index) =>
            part.start !== result.feedback!.parts[index].start ||
            part.end !== result.feedback!.parts[index].end,
        )
      )
        throw new Pause('error');
    }
    const maximum = request.purpose === 'typed-equivalence' ? 1 : request.maxMarks;
    const threshold =
      request.purpose === 'mark-allocation'
        ? jevAllocationConfidenceThreshold(maximum)
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
    const response = await fetcher(`${origin}/api/ai/jev`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (response.status === 429) throw hostedLimitError(response, 'marking');
    if (!response.ok)
      throw new Pause(
        response.status === 401
          ? 'session-rejected'
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
    return guarded(
      externalSignal,
      timeout,
      async (signal) => {
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
      },
      request.purpose !== 'typed-equivalence',
    );
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
          feedback: result.feedback ?? { kind: null, parts: [] },
        }
      : {
          outcome: 'unsure',
          feedback:
            result && eligible() && !request.signal?.aborted ? (result.feedback ?? null) : null,
        };
  }
  const controller = {
    enable(version: number) {
      if (version !== JEV_CONSENT_VERSION) return;
      try {
        if (!storage) throw new Error('Storage unavailable');
        if (!readCredential()) {
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          const credential = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
            '',
          );
          storage.setItem(JEV_INSTALLATION_STORAGE_KEY, credential);
        }
        settings = { enabled: true, acceptedConsentVersion: version };
      } catch {
        settings = off;
        stop();
      }
      save();
    },
    disable() {
      stop();
      settings = { ...settings, enabled: false };
      save();
    },
    async quotaId(): Promise<string | null> {
      if (!settings.enabled) return null;
      const credential = readCredential();
      if (!credential) return null;
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential));
      return settings.enabled && readCredential() === credential
        ? Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
        : null;
    },
  };
  const changed = (event: StorageEvent) => {
    if (
      event.key !== null &&
      event.key !== JEV_SETTINGS_STORAGE_KEY &&
      event.key !== JEV_INSTALLATION_STORAGE_KEY
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
    cancellationSignal: () => generation.signal,
    settings: () => settings,
    status: () => {
      publish(false);
      return status;
    },
    marker: () => {
      if (!eligible()) return null;
      const credential = readCredential();
      const expiresAt = session?.credential === credential ? session.expiresAt : null;
      if (
        (expiresAt === null || expiresAt <= Date.now() + 5000) &&
        (warmedSession?.credential !== credential || warmedSession.expiresAt !== expiresAt)
      ) {
        warmedSession = { credential, expiresAt };
        void token(generation.signal).catch(() => {});
      }
      return markTyped;
    },
    subscribe(listener: () => void) {
      if (!listeners.size) {
        globalThis.addEventListener?.('storage', changed);
        globalThis.addEventListener?.('online', online);
        globalThis.addEventListener?.('offline', online);
      }
      listeners.add(listener);
      publish(false);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearTimeout(retryTimer);
          retryTimer = undefined;
          globalThis.removeEventListener?.('storage', changed);
          globalThis.removeEventListener?.('online', online);
          globalThis.removeEventListener?.('offline', online);
        }
      };
    },
  };
}
export const jevEngine = createJevEngine();
