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
import type { JevAttemptMarking } from './types';
import type { JevDecisionRequest } from './protocol';

const idle: JevAttemptMarking = { state: 'idle' };
const progress = new Map<string, JevAttemptMarking>();
const listeners = new Set<() => void>();
type Engine = ReturnType<typeof createJevEngine>;
const jobs = new WeakMap<Engine, Map<string, Promise<void>>>();
const tried = new WeakMap<Engine, Map<string, string>>();
function publish(id: string, state: JevAttemptMarking) {
  if (JSON.stringify(progress.get(id)) === JSON.stringify(state)) return;
  progress.set(id, state);
  // Only retain progress for a bounded number of recently viewed attempts.
  if (progress.size > 128) progress.delete(progress.keys().next().value!);
  listeners.forEach((listener) => listener());
}
function candidates(attempt: QuestionSetAttemptRecord) {
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

/** Safe to call repeatedly. Reloads resume undecided submitted lines; failures leave them manual. */
export function markJevAttempt(id: string, engine: Engine = jevEngine): Promise<void> {
  if (!engine.eligible()) {
    publish(id, idle);
    return Promise.resolve();
  }
  let active = jobs.get(engine);
  if (!active) {
    active = new Map();
    jobs.set(engine, active);
  }
  const existing = active.get(id);
  if (existing) return existing;
  const run = async () => {
    const attempt = await getQuestionSetAttempt(id);
    if (!attempt || attempt.status === 'complete' || attempt.undoneAt !== undefined) {
      publish(id, idle);
      return;
    }
    const lines = candidates(attempt);
    let seen = tried.get(engine);
    if (!seen) {
      seen = new Map();
      tried.set(engine, seen);
    }
    for (let index = 0; index < lines.length; index++) {
      if (!engine.eligible()) break;
      const line = lines[index];
      const key = `${id}:${line.allocationId}`;
      const content = JSON.stringify(line.request);
      if (seen.get(key) === content || line.request.maxMarks > 9) continue;
      // Re-read immediately before sending too: already-decided lines need no paid call.
      const current = await getQuestionSetAttempt(id);
      if (
        !current ||
        current.status === 'complete' ||
        current.decisions.some((row) => row.allocationId === line.allocationId)
      )
        continue;
      publish(id, { state: 'marking', remaining: lines.length - index });
      seen.set(key, content);
      if (seen.size > 2048) seen.delete(seen.keys().next().value!);
      const result = await engine.decide(line.request);
      if (result?.value !== null && result !== null && engine.eligible()) {
        await applyJevAllocationDecision(
          id,
          current.revisionId,
          line.nodeId,
          {
            allocationId: line.allocationId,
            status: 'awarded',
            marks: result.value,
            markedBy: {
              by: 'jev',
              model: result.model,
              confidence: result.confidence,
              markedAt: Date.now(),
            },
          },
          engine.eligible,
        );
      }
    }
    const current = await getQuestionSetAttempt(id);
    if (!engine.eligible() || !current) {
      publish(id, idle);
      return;
    }
    publish(id, {
      state: 'done',
      marked: current.decisions.filter((line) => line.markedBy?.by === 'jev').length,
      leftForYou: candidates(current).length,
    });
  };
  const promise = run()
    .catch(() => {
      publish(id, idle);
    })
    .finally(() => {
      active!.delete(id);
    });
  active.set(id, promise);
  return promise;
}

export function useJevAttemptMarking(attemptId: string): JevAttemptMarking {
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
  const snapshot = useCallback(() => progress.get(attemptId) ?? idle, [attemptId]);
  const state = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    void markJevAttempt(attemptId);
  }, [attemptId, revision, settings.enabled, status.state]);
  return !settings.enabled || status.state !== 'ready' ? idle : state;
}
