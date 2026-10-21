import { createHostedTransport, HOSTED_ACCESS_STORAGE_KEY, HostedTransportError } from '../ai/session/hostedTransport';
import { HOSTED_SERVICE_ORIGIN } from '../config/origins';
import { decisionHash, jevDecisionCache, type JevDecisionCache } from './cache';
import { jevDecisionRequestSchema, jevDecisionResultSchema, type JevDecisionRequest, type JevDecisionResult } from './protocol';
import { JEV_CONSENT_VERSION, JEV_TYPED_TIMEOUT_MS, type JevSettings, type JevStatus, type JevPauseReason, type JevTypedAnswerRequest, type JevTypedVerdict } from './types';

export const JEV_SETTINGS_STORAGE_KEY = 'lacuna.jevSettings';
const off: JevSettings = { enabled: false, acceptedConsentVersion: null };
class Pause extends Error { constructor(readonly reason: JevPauseReason) { super(reason); } }
export function createJevEngine(options: { fetcher?: typeof fetch; storage?: Storage; cache?: JevDecisionCache } = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const fetcher: typeof fetch = options.fetcher ?? ((...args) => globalThis.fetch(...args));
  const transport = createHostedTransport(fetcher);
  const cache = options.cache ?? jevDecisionCache;
  const listeners = new Set<() => void>();
  const readCode = () => { try { return storage?.getItem(HOSTED_ACCESS_STORAGE_KEY)?.trim() || ''; } catch { return ''; } };
  const readSettings = (): JevSettings => {
    try {
      const value = JSON.parse(storage?.getItem(JEV_SETTINGS_STORAGE_KEY) ?? 'null');
      if (typeof value?.enabled === 'boolean' && (value.acceptedConsentVersion === null || Number.isInteger(value.acceptedConsentVersion))) {
        return { enabled: value.enabled && value.acceptedConsentVersion === JEV_CONSENT_VERSION, acceptedConsentVersion: value.acceptedConsentVersion };
      }
    } catch { /* Invalid or unavailable local storage means off. */ }
    return off;
  };
  let settings = readSettings();
  let status: JevStatus = { state: 'off' };
  let lastUsedAt: number | null = null;
  let pause: JevPauseReason | null = null;
  let generation = new AbortController();
  let session: { code: string; token: string; expiresAt: number } | null = null;
  let exchange: { code: string; promise: Promise<{ token: string; expiresAt: number }> } | null = null;
  const publish = (notify = true) => {
    const next: JevStatus = !settings.enabled ? { state: 'off' }
      : !readCode() ? { state: 'paused', reason: 'no-access-code', lastUsedAt }
        : globalThis.navigator?.onLine === false ? { state: 'paused', reason: 'offline', lastUsedAt }
          : pause ? { state: 'paused', reason: pause, lastUsedAt } : { state: 'ready', lastUsedAt };
    if (JSON.stringify(next) !== JSON.stringify(status)) status = next;
    if (notify) listeners.forEach((listener) => listener());
  };
  const stop = () => { generation.abort(); generation = new AbortController(); exchange = null; };
  const save = () => { try { storage?.setItem(JEV_SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { settings = off; stop(); } publish(); };
  const eligible = () => settings.enabled && settings.acceptedConsentVersion === JEV_CONSENT_VERSION && !!readCode() && globalThis.navigator?.onLine !== false && !pause;
  const reason = (error: unknown): JevPauseReason => error instanceof Pause ? error.reason
    : error instanceof HostedTransportError ? ({ access: 'access-code-rejected', quota: 'limit-reached', unavailable: 'service-disabled', network: 'offline', invalid: 'error' } as const)[error.kind]
      : globalThis.navigator?.onLine === false ? 'offline' : 'error';
  async function token(signal: AbortSignal) {
    const code = readCode();
    if (session?.code === code && session.expiresAt > Date.now() + 5000) return session.token;
    if (!exchange || exchange.code !== code) {
      const pending = { code, promise: transport.exchange(code, generation.signal) };
      exchange = pending;
      void pending.promise.finally(() => { if (exchange === pending) exchange = null; }).catch(() => {});
    }
    const result = await exchange.promise;
    signal.throwIfAborted();
    session = { ...result, code };
    return result.token;
  }
  async function decide(request: JevDecisionRequest, externalSignal?: AbortSignal, timeout = 30_000): Promise<JevDecisionResult | null> {
    if (!eligible() || externalSignal?.aborted) { publish(); return null; }
    const lifetime = generation.signal;
    const controller = new AbortController();
    const signals = [lifetime, ...(externalSignal ? [externalSignal] : [])];
    const abort = () => controller.abort();
    signals.forEach((signal) => signal.addEventListener('abort', abort, { once: true }));
    const timer = setTimeout(abort, timeout);
    const signal = controller.signal;
    let onAbort: () => void = () => {};
    const aborted = new Promise<null>((resolve) => { onAbort = () => resolve(null); signal.addEventListener('abort', onAbort, { once: true }); });
    try {
      const work = (async () => {
        const parsed = jevDecisionRequestSchema.parse(request);
        const hash = await decisionHash(parsed);
        signal.throwIfAborted();
        const hit = await cache.get(hash);
        signal.throwIfAborted();
        if (hit) return hit;
        const accessToken = await token(signal);
        signal.throwIfAborted();
        if (!eligible()) return null;
        const origin = globalThis.window?.electronAPI?.isElectron === true ? HOSTED_SERVICE_ORIGIN : '';
        let response: Response;
        try {
          response = await fetcher(`${origin}/api/ai/jev`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(parsed), signal });
        } catch (error) { if (!signal.aborted) throw new Pause('offline'); throw error; }
        if (!response.ok) throw new Pause(response.status === 401 ? 'access-code-rejected' : response.status === 429 ? 'limit-reached' : response.status === 503 ? 'service-disabled' : 'error');
        const result = jevDecisionResultSchema.parse(await response.json());
        const maximum = parsed.purpose === 'typed-equivalence' ? 1 : parsed.maxMarks;
        if (result.value !== null && (result.value > maximum || result.confidence < 0.85)) throw new Pause('error');
        signal.throwIfAborted();
        await cache.put(hash, result);
        signal.throwIfAborted();
        lastUsedAt = Date.now(); publish();
        return result;
      })();
      const result = await Promise.race([work, aborted]);
      if (signal.aborted) {
        if (!externalSignal?.aborted && !lifetime.aborted) { pause = 'error'; publish(); }
        return null;
      }
      return result;
    } catch (error) {
      if (!signal.aborted && !lifetime.aborted) {
        pause = reason(error);
        if (pause === 'access-code-rejected') session = null;
        publish();
      }
      return null;
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', onAbort);
      signals.forEach((source) => source.removeEventListener('abort', abort));
    }
  }
  async function markTyped(request: JevTypedAnswerRequest): Promise<JevTypedVerdict> {
    const result = await decide({ purpose: 'typed-equivalence', prompt: request.prompt, expected: request.expected, answer: request.answer.normalize('NFC').trim().replace(/\s+/g, ' ') }, request.signal, JEV_TYPED_TIMEOUT_MS);
    return result !== null && result.value !== null && eligible() && !request.signal?.aborted
      ? { outcome: result.value === 1 ? 'correct' : 'incorrect', provenance: { by: 'jev', model: result.model, confidence: result.confidence, markedAt: Date.now() } }
      : { outcome: 'unsure' };
  }
  const controller = {
    enable(version: number) { if (version !== JEV_CONSENT_VERSION) return; pause = null; settings = { enabled: true, acceptedConsentVersion: version }; save(); },
    disable() { stop(); pause = null; settings = { ...settings, enabled: false }; save(); },
    hasAccessCode: () => !!readCode(),
    async connectAccessCode(code: string): Promise<{ ok: true } | { ok: false; message: string }> {
      if (!settings.enabled || settings.acceptedConsentVersion !== JEV_CONSENT_VERSION) return { ok: false, message: 'Accept the current consent before connecting.' };
      const signal = generation.signal;
      try {
        const result = await transport.exchange(code.trim(), signal);
        signal.throwIfAborted();
        storage.setItem(HOSTED_ACCESS_STORAGE_KEY, code.trim());
        session = { ...result, code: code.trim() }; pause = null; publish(); return { ok: true };
      } catch (error) { if (!signal.aborted) { pause = reason(error); publish(); } return { ok: false, message: 'Could not connect the access code.' }; }
    },
  };
  const changed = () => { settings = readSettings(); stop(); session = null; pause = null; publish(); };
  const online = () => { if (pause === 'offline') pause = null; publish(); };
  publish();
  return {
    ...controller, decide, markTyped, eligible,
    settings: () => settings,
    status: () => { publish(false); return status; },
    marker: () => eligible() ? markTyped : null,
    subscribe(listener: () => void) {
      if (!listeners.size) { globalThis.addEventListener?.('storage', changed); globalThis.addEventListener?.('online', online); globalThis.addEventListener?.('offline', online); }
      listeners.add(listener);
      return () => { listeners.delete(listener); if (!listeners.size) { globalThis.removeEventListener?.('storage', changed); globalThis.removeEventListener?.('online', online); globalThis.removeEventListener?.('offline', online); } };
    },
  };
}
export const jevEngine = createJevEngine();
