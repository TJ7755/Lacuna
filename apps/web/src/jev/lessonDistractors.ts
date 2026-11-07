import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { jevDistractorCache } from './cache';
import { jevEngine } from './engine';
import {
  JEV_DISTRACTOR_BATCH_TARGETS,
  JEV_DISTRACTOR_MAX_ANSWER,
  JEV_DISTRACTOR_MAX_BANK,
  JEV_DISTRACTOR_MAX_BYTES,
  JEV_DISTRACTOR_MAX_PROMPT,
  JEV_DISTRACTOR_POLICY_VERSION,
  JEV_DISTRACTOR_SINGLE_BATCH,
  JEV_MODEL,
  lessonDistractorCandidates,
  lessonDistractorTargets,
  validLessonDistractorRankings,
  type JevLessonDistractorRequest,
  type JevLessonDistractorResult,
} from './protocol';

interface LessonCard {
  id: string;
  prompt: string;
  answer: string;
}

interface Batch {
  ids: string[];
  request: JevLessonDistractorRequest;
}

type Rankings = ReadonlyMap<string, readonly string[]>;
const empty: Rankings = new Map();
const encoder = new TextEncoder();
const bytes = (content: unknown) => encoder.encode(JSON.stringify(content)).length;

function eligibleCards(cards: readonly LessonCard[]): LessonCard[] {
  const byId = new Map<string, LessonCard>();
  for (const { id, prompt: source, answer: expected } of cards) {
    const prompt = source.trim();
    const answer = expected.trim();
    if (
      id &&
      !byId.has(id) &&
      prompt &&
      prompt.length <= JEV_DISTRACTOR_MAX_PROMPT &&
      answer &&
      answer.length <= JEV_DISTRACTOR_MAX_ANSWER
    )
      byId.set(id, { id, prompt, answer });
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id === b.id ? 0 : 1));
}

/** Small lessons send all targets and candidates once. Larger lessons split targets and
 * draw an evenly spaced candidate bank from the whole lesson for each request. */
export function lessonDistractorBatches(input: readonly LessonCard[]): Batch[] {
  const cards = eligibleCards(input);
  if (cards.length < 3) return [];
  const all = cards.map(({ prompt, answer }) => ({ prompt, answer }));
  if (all.length <= JEV_DISTRACTOR_SINGLE_BATCH && bytes(all) <= JEV_DISTRACTOR_MAX_BYTES)
    return [
      { ids: cards.map(({ id }) => id), request: { purpose: 'lesson-distractors', cards: all } },
    ];

  const batches: Batch[] = [];
  let offset = 0;
  while (offset < cards.length) {
    const ids: string[] = [];
    const bank: JevLessonDistractorRequest['cards'] = [];
    const targets: number[] = [];
    let size = 2;
    while (offset < cards.length && targets.length < JEV_DISTRACTOR_BATCH_TARGETS) {
      const row = all[offset];
      const rowSize = bytes(row) + 1;
      // Leave room for answers from other parts of the lesson.
      if (size + rowSize > (JEV_DISTRACTOR_MAX_BYTES * 2) / 3) break;
      size += rowSize;
      targets.push(bank.length);
      bank.push(row);
      ids.push(cards[offset++].id);
    }
    const included = new Set(ids);
    const sample = Math.min(cards.length, JEV_DISTRACTOR_MAX_BANK * 2);
    for (let step = 0; step < sample && bank.length < JEV_DISTRACTOR_MAX_BANK; step++) {
      const candidate = cards[(offset + Math.floor((step * cards.length) / sample)) % cards.length];
      if (included.has(candidate.id)) continue;
      const row = { answer: candidate.answer };
      const rowSize = bytes(row) + 1;
      if (size + rowSize > JEV_DISTRACTOR_MAX_BYTES) continue;
      size += rowSize;
      bank.push(row);
      ids.push(candidate.id);
      included.add(candidate.id);
    }
    batches.push({ ids, request: { purpose: 'lesson-distractors', cards: bank, targets } });
  }
  return batches;
}

const obsolete = Symbol('obsolete batch');
type BatchAttempt = JevLessonDistractorResult | { retryAt: number } | typeof obsolete | null;
const pending = new Map<string, { consent: AbortSignal; result: Promise<BatchAttempt> }>();
const retryAfter = new Map<string, number>();
const recentStarts: number[] = [];
let activeRequest: Promise<BatchAttempt> | undefined;

async function fetchBatch(
  hash: string,
  request: JevLessonDistractorRequest,
  consent: AbortSignal,
  relevance: AbortSignal,
): Promise<BatchAttempt> {
  const cached = await jevDistractorCache.get(hash);
  if (cached && validLessonDistractorRankings(request, cached)) return cached;
  if (!jevEngine.eligible()) return null;
  if (
    !lessonDistractorTargets(request).some(
      (target) => lessonDistractorCandidates(request.cards, target).length >= 2,
    )
  )
    return null;
  const run = async (): Promise<BatchAttempt> => {
    if (relevance.aborted) return obsolete;
    if (!jevEngine.eligible() || (retryAfter.get(hash) ?? 0) > Date.now()) return null;
    const hit = await jevDistractorCache.get(hash);
    if (hit && validLessonDistractorRankings(request, hit)) return hit;
    if (relevance.aborted) return obsolete;
    if (!jevEngine.eligible()) return null;
    const now = Date.now();
    while (recentStarts[0] <= now - 60_000) recentStarts.shift();
    // Leave the foreground marker most of the installation's request allowance.
    if (recentStarts.length >= 4) return { retryAt: recentStarts[0] + 60_000 };
    recentStarts.push(now);
    // Once sent, the request belongs to this consent generation. An immediate remount
    // can join it even if the original hook has left.
    const result = await jevEngine.rankLessonDistractors(request, consent);
    if (result && !consent.aborted) {
      await jevDistractorCache.put(hash, result);
      retryAfter.delete(hash);
    } else if (!consent.aborted) {
      retryAfter.set(hash, Date.now() + 120_000);
      if (retryAfter.size > 128) retryAfter.delete(retryAfter.keys().next().value!);
    }
    return result;
  };
  while (activeRequest && !relevance.aborted) await activeRequest.catch(() => undefined);
  if (relevance.aborted) return obsolete;
  const locks = globalThis.navigator?.locks;
  const requestResult = locks
    ? locks.request('lacuna-jev-distractors', { signal: relevance }, run)
    : run();
  activeRequest = requestResult;
  try {
    return await requestResult;
  } finally {
    if (activeRequest === requestResult) activeRequest = undefined;
  }
}

function waitForAllowance(retryAt: number, relevance: AbortSignal): Promise<void> {
  if (relevance.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      relevance.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, retryAt - Date.now()));
    relevance.addEventListener('abort', finish, { once: true });
  });
}

async function tryBatch(hash: string, batch: Batch, consent: AbortSignal, relevance: AbortSignal) {
  const existing = pending.get(hash);
  if (existing && !existing.consent.aborted) return existing.result;
  const result = fetchBatch(hash, batch.request, consent, relevance).catch(() =>
    relevance.aborted ? obsolete : null,
  );
  const job = { consent, result };
  pending.set(hash, job);
  try {
    return await result;
  } finally {
    if (pending.get(hash) === job) pending.delete(hash);
  }
}

async function prepareBatch(
  lessonId: string,
  batch: Batch,
  consent: AbortSignal,
  relevance: AbortSignal,
): Promise<JevLessonDistractorResult | null> {
  const input = JSON.stringify([
    JEV_MODEL,
    JEV_DISTRACTOR_POLICY_VERSION,
    lessonId,
    batch.ids,
    batch.request,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  while (!relevance.aborted) {
    const attempt = await tryBatch(hash, batch, consent, relevance);
    if (attempt === obsolete) continue;
    if (!attempt || !('retryAt' in attempt)) return attempt;
    await waitForAllowance(attempt.retryAt, relevance);
  }
  return null;
}

export function useLessonDistractors(
  lessonId: string | undefined,
  cards: readonly LessonCard[],
): Rankings {
  const status = useSyncExternalStore(jevEngine.subscribe, jevEngine.status);
  const enabled = status.state !== 'off';
  const ready = status.state === 'ready';
  const eligible = useMemo(
    () => (enabled && lessonId ? eligibleCards(cards) : []),
    [cards, enabled, lessonId],
  );
  const key = useMemo(() => JSON.stringify(eligible), [eligible]);
  const [prepared, setPrepared] = useState<{ lessonId: string; key: string; rankings: Rankings }>();

  useEffect(() => {
    if (!lessonId || !enabled) return;
    const consent = jevEngine.cancellationSignal();
    const current = new AbortController();
    const relevance = AbortSignal.any([consent, current.signal]);
    void (async () => {
      const rankings = new Map<string, readonly string[]>();
      for (const batch of lessonDistractorBatches(eligible)) {
        if (relevance.aborted) break;
        const result = await prepareBatch(lessonId, batch, consent, relevance);
        if (!result || relevance.aborted) continue;
        for (const [index, target] of lessonDistractorTargets(batch.request).entries())
          rankings.set(
            batch.ids[target],
            result.rankings[index].map((candidate) => batch.ids[candidate]),
          );
        setPrepared({ lessonId, key, rankings: new Map(rankings) });
      }
    })().catch(() => {
      /* Browser and storage limitations leave local choices in use. */
    });
    return () => current.abort();
  }, [eligible, enabled, key, lessonId, ready]);

  return enabled && prepared?.lessonId === lessonId && prepared?.key === key
    ? prepared.rankings
    : empty;
}
