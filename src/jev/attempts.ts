import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import {
  applyJevAllocationDecision,
  getQuestionSetAttempt,
} from '../questions/questionSetAttemptRepository';
import type { QuestionSetAttemptRecord } from '../questions/questionSetAttempts';
import type { QuestionAnswer } from '../questions/questionSets';
import { jevEngine, type createJevEngine } from './engine';
import type { JevAllocationMarking } from './types';
import {
  JEV_BATCH_MAX_ALLOCATIONS,
  JEV_BATCH_REQUEST_BYTE_LIMIT,
  type JevDecisionRequest,
} from './protocol';

const idle: JevAllocationMarking = { state: 'idle' };
const progress = new Map<string, JevAllocationMarking>();
const listeners = new Set<() => void>();
type Engine = ReturnType<typeof createJevEngine>;
interface MarkingJob {
  promise: Promise<void>;
  again: boolean;
}
const jobs = new WeakMap<Engine, Map<string, MarkingJob>>();
const tried = new WeakMap<Engine, Map<string, string>>();
// Criteria request independently, but their decisions share one attempt revision.
const applications = new Map<string, Promise<unknown>>();
function serialiseApplication<T>(attemptId: string, apply: () => Promise<T>): Promise<T> {
  const pending = (applications.get(attemptId) ?? Promise.resolve()).then(apply);
  const settled = pending
    .catch(() => undefined)
    .finally(() => {
      if (applications.get(attemptId) === settled) applications.delete(attemptId);
    });
  applications.set(attemptId, settled);
  return pending;
}
function publish(id: string, state: JevAllocationMarking) {
  if (progress.get(id)?.state === state.state) return;
  progress.set(id, state);
  // Only retain progress for a bounded number of recently viewed attempts.
  if (progress.size > 128) progress.delete(progress.keys().next().value!);
  listeners.forEach((listener) => listener());
}
function candidates(attempt: QuestionSetAttemptRecord, only?: string) {
  const nodes: Array<{ nodeId: string; prompt: string; answer: QuestionAnswer }> = [];
  const add = (
    node: { id: string; prompt: string; answer?: QuestionAnswer },
    parents: string[],
  ) => {
    if (node.answer?.response.kind === 'written')
      nodes.push({
        nodeId: node.id,
        prompt: [...parents, node.prompt].filter(Boolean).join('\n\n'),
        answer: node.answer,
      });
  };
  for (const question of attempt.receipt.questions) {
    add(question, []);
    for (const part of question.parts) {
      add(part, [question.prompt]);
      for (const subpart of part.subparts) add(subpart, [question.prompt, part.prompt]);
    }
  }
  return nodes.flatMap((node) => {
    const submitted = attempt.responses.find((row) => row.nodeId === node.nodeId)?.submitted;
    if (submitted?.kind !== 'written') return [];
    return node.answer.allocations.flatMap((allocation) =>
      (only !== undefined && allocation.id !== only) ||
      attempt.decisions.some((row) => row.allocationId === allocation.id)
        ? []
        : [
            {
              nodeId: node.nodeId,
              allocationId: allocation.id,
              request: {
                purpose: 'mark-allocation' as const,
                prompt: node.prompt,
                criterion: allocation.criterion,
                explanation: allocation.explanation ?? '',
                maxMarks: allocation.maxMarks,
                answer: submitted.text,
              } satisfies JevDecisionRequest,
            },
          ],
    );
  });
}

/**
 * Safe to call repeatedly. Reloads resume undecided submitted lines; failures leave them manual.
 * With `only`, marks just that allocation: the criterion the learner has open, which is shown
 * being judged for at least `judgingMs` however quickly the verdict arrives.
 */
export function markJevAttempt(
  attemptId: string,
  engine: Engine = jevEngine,
  only?: string,
  judgingMs = 0,
): Promise<void> {
  const id = attemptId;
  const key = only === undefined ? id : `${id}:${only}`;
  if (engine.status().state === 'off') {
    publish(key, idle);
    return Promise.resolve();
  }
  let active = jobs.get(engine);
  if (!active) {
    active = new Map();
    jobs.set(engine, active);
  }
  const existing = active.get(key);
  if (existing) {
    existing.again = true;
    return existing.promise;
  }
  const run = async () => {
    let failedApplication = false;
    const lifetime = engine.cancellationSignal();
    const stillEnabled = () => !lifetime.aborted && engine.eligible();
    const attempt = await getQuestionSetAttempt(id);
    if (!attempt || attempt.status === 'complete' || attempt.undoneAt !== undefined) {
      publish(key, idle);
      return;
    }
    const lines = candidates(attempt, only);
    let seen = tried.get(engine);
    if (!seen) {
      seen = new Map();
      tried.set(engine, seen);
    }
    const fresh = lines.filter(
      (line) => seen.get(`${id}:${line.allocationId}`) !== JSON.stringify(line.request),
    );
    // Abandon every line in this run, including batches never sent after a failure or pause.
    for (const line of fresh) seen.set(`${id}:${line.allocationId}`, JSON.stringify(line.request));
    while (seen.size > 2048) seen.delete(seen.keys().next().value!);
    if (!stillEnabled()) {
      publish(key, idle);
      return;
    }
    const batches: Array<typeof lines> = [];
    let batch: typeof lines = [];
    const bodySize = (rows: typeof lines) =>
      new TextEncoder().encode(
        JSON.stringify({
          purpose: 'mark-allocation',
          allocations: rows.map(({ request: { purpose: _purpose, ...allocation } }) => allocation),
        }),
      ).byteLength;
    for (const line of fresh) {
      if (line.request.maxMarks > 9 || bodySize([line]) > JEV_BATCH_REQUEST_BYTE_LIMIT) continue;
      if (
        batch.length &&
        (batch.length >= JEV_BATCH_MAX_ALLOCATIONS ||
          bodySize([...batch, line]) > JEV_BATCH_REQUEST_BYTE_LIMIT)
      ) {
        batches.push(batch);
        batch = [];
      }
      batch.push(line);
    }
    if (batch.length) batches.push(batch);
    for (const queued of batches) {
      if (!stillEnabled()) break;
      // One read immediately before the batch, plus guarded re-checks before every write.
      const current = await getQuestionSetAttempt(id);
      if (!current || current.status === 'complete' || current.undoneAt !== undefined) break;
      const pending = queued.filter(
        (line) => !current.decisions.some((row) => row.allocationId === line.allocationId),
      );
      if (!pending.length) continue;
      publish(key, { state: 'marking' });
      const judged = Date.now() + judgingMs;
      const results = await engine.decideAllocations(
        pending.map(({ request: { purpose: _purpose, ...allocation } }) => allocation),
        lifetime,
      );
      const wait = judged - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      if (!results || !stillEnabled()) break;
      for (const [index, line] of pending.entries()) {
        const result = results[index];
        const marks = result.value;
        if (marks === null) continue;
        let applied = false;
        try {
          applied = await serialiseApplication(id, async () => {
            const latest = await getQuestionSetAttempt(id);
            if (!latest || !stillEnabled()) return false;
            return applyJevAllocationDecision(
              id,
              latest.revisionId,
              line.nodeId,
              {
                allocationId: line.allocationId,
                status: 'awarded',
                marks,
                markedBy: {
                  by: 'jev',
                  model: result.model,
                  confidence: result.confidence,
                  markedAt: Date.now(),
                },
              },
              stillEnabled,
            );
          });
        } finally {
          // A confident verdict that failed to save may retry on entry; abstentions stay manual.
          if (!applied && stillEnabled()) {
            failedApplication = true;
            seen.delete(`${id}:${line.allocationId}`);
          }
        }
      }
    }
    const current = await getQuestionSetAttempt(id);
    publish(
      key,
      engine.eligible() && current && candidates(current, only).length
        ? { state: failedApplication ? 'failed' : 'left' }
        : idle,
    );
  };
  const job: MarkingJob = { promise: Promise.resolve(), again: false };
  const drain = async () => {
    do {
      job.again = false;
      await run();
    } while (job.again && engine.eligible());
  };
  job.promise = drain()
    .catch(() => {
      publish(key, only === undefined ? idle : { state: 'failed' });
    })
    .finally(() => {
      active!.delete(key);
    });
  active.set(key, job);
  return job.promise;
}

/**
 * Marks the open criterion when the learner reaches it, never the criteria they have not opened.
 * Leaving starts nothing new; a request already sent still lands on its own criterion.
 */
export function useJevAllocationMarking(
  attemptId: string,
  allocationId: string | undefined,
  judgingMs = 0,
): JevAllocationMarking {
  const settings = useSyncExternalStore(jevEngine.subscribe, jevEngine.settings);
  const status = useSyncExternalStore(jevEngine.subscribe, jevEngine.status);
  const revision = useLiveQuery(
    () => db.questionSetAttempts.get(attemptId).then((row) => row?.revisionId),
    [attemptId],
  );
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const key = `${attemptId}:${allocationId}`;
  const snapshot = useCallback(() => progress.get(key) ?? idle, [key]);
  const state = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (allocationId !== undefined)
      void markJevAttempt(attemptId, jevEngine, allocationId, judgingMs);
    // The judging time applies to the next request; a change alone starts nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, allocationId, revision, settings.enabled, status.state]);
  if (!settings.enabled || allocationId === undefined) return idle;
  if (status.state === 'paused' && state.state !== 'left') return { state: 'unavailable' };
  return status.state === 'ready' ? state : idle;
}
