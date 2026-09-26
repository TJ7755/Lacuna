import type { QuestionSetAttemptRecord } from './questionSetAttempts';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row)
    .sort()
    .filter((key) => row[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`)
    .join(',')}}`;
}

function attemptState(attempt: QuestionSetAttemptRecord): string {
  return canonicalJson({ ...attempt, revisionId: undefined });
}

/** Reserved, bounded identity for a state synthesised from concurrent revisions. */
function mergedRevisionId(state: string): string {
  const seeds = [2166136261, 3339675911, 2284105051, 1024243019];
  const digest = seeds.map((seed) => {
    let hash = seed;
    for (let index = 0; index < state.length; index++) {
      hash ^= state.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  });
  return `merged-attempt:fnv1a128-${digest.join('')}`;
}

function revisionIsNewer(left: string, right: string): boolean {
  const leftSynthetic = left.startsWith('merged-attempt:');
  const rightSynthetic = right.startsWith('merged-attempt:');
  if (leftSynthetic !== rightSynthetic) return leftSynthetic;
  return left > right;
}

/** Merge one immutable attempt identity without discarding durable learner evidence. */
export function mergeQuestionSetAttemptPair(
  existing: QuestionSetAttemptRecord,
  incoming: QuestionSetAttemptRecord,
): QuestionSetAttemptRecord {
  if (canonicalJson(existing.receipt) !== canonicalJson(incoming.receipt)) {
    throw new Error(`Question Set attempt ${incoming.id} has conflicting immutable receipts.`);
  }
  if (
    existing.id !== incoming.id ||
    existing.mode !== incoming.mode ||
    existing.courseId !== incoming.courseId ||
    existing.questionSetId !== incoming.questionSetId ||
    existing.createdAt !== incoming.createdAt
  )
    throw new Error(`Question Set attempt ${incoming.id} has conflicting immutable identity.`);
  if (
    existing.revisionId === incoming.revisionId &&
    canonicalJson(existing) !== canonicalJson(incoming)
  ) {
    throw new Error(`Question Set attempt ${incoming.id} reuses a revision for unequal data.`);
  }
  const submitted = (attempt: QuestionSetAttemptRecord) =>
    attempt.responses.filter((row) => row.submitted !== undefined);
  for (const original of submitted(existing)) {
    const competing = submitted(incoming).find((row) => row.nodeId === original.nodeId);
    if (competing && canonicalJson(competing) !== canonicalJson(original)) {
      throw new Error(`Question Set attempt ${incoming.id} has conflicting submitted responses.`);
    }
  }
  if (
    existing.paperSubmittedAt !== undefined &&
    incoming.paperSubmittedAt !== undefined &&
    existing.paperSubmittedAt !== incoming.paperSubmittedAt
  )
    throw new Error(`Question Set attempt ${incoming.id} has conflicting paper submission.`);

  const lifecycle = { answering: 0, marking: 1, complete: 2 } as const;
  const incomingWins =
    lifecycle[incoming.status] > lifecycle[existing.status] ||
    (lifecycle[incoming.status] === lifecycle[existing.status] &&
      (incoming.updatedAt > existing.updatedAt ||
        (incoming.updatedAt === existing.updatedAt &&
          revisionIsNewer(incoming.revisionId, existing.revisionId))));
  const selected = incomingWins ? incoming : existing;
  const winner = structuredClone(selected);
  const loser = incomingWins ? existing : incoming;
  for (const original of submitted(loser)) {
    const target = winner.responses.find((row) => row.nodeId === original.nodeId)!;
    if (!target.submitted) {
      target.submitted = structuredClone(original.submitted);
      target.submittedAt = original.submittedAt;
      target.draft = structuredClone(original.submitted!);
    }
  }
  const revealed = new Set([...existing.revealedQuestionIds, ...incoming.revealedQuestionIds]);
  winner.revealedQuestionIds = winner.receipt.questions
    .map((question) => question.id)
    .filter((id) => revealed.has(id));
  const assistance = new Map(
    [...existing.assistance, ...incoming.assistance].map((event) => [canonicalJson(event), event]),
  );
  winner.assistance = [...assistance.values()].sort(
    (a, b) => a.occurredAt - b.occurredAt || canonicalJson(a).localeCompare(canonicalJson(b)),
  );
  winner.paperSubmittedAt = existing.paperSubmittedAt ?? incoming.paperSubmittedAt;
  const allSubmitted = winner.responses.every((response) => response.submitted);
  if (allSubmitted && winner.status === 'answering') winner.status = 'marking';
  if (winner.mode === 'paper' && allSubmitted) {
    winner.revealedQuestionIds = winner.receipt.questions.map((question) => question.id);
  }
  winner.updatedAt = Math.max(existing.updatedAt, incoming.updatedAt);
  if (attemptState(winner) !== attemptState(selected)) {
    winner.revisionId = mergedRevisionId(attemptState(winner));
  }
  return winner;
}
