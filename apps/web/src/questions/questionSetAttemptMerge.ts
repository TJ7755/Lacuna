import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';

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
    existing.practiceScope !== incoming.practiceScope ||
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

  if (canonicalJson(existing.conceptPractice) !== canonicalJson(incoming.conceptPractice))
    throw new Error(`Question Set attempt ${incoming.id} has conflicting Concept selection.`);
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
  if (existing.jevAssessmentReceipts || incoming.jevAssessmentReceipts) {
    const receipts = new Map(
      [...(existing.jevAssessmentReceipts ?? []), ...(incoming.jevAssessmentReceipts ?? [])].map(
        (receipt) => [canonicalJson(receipt), receipt],
      ),
    );
    winner.jevAssessmentReceipts = [...receipts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, receipt]) => structuredClone(receipt));
  }
  // A model result is subordinate to a learner decision, including across peers.
  const winnerHasModelMarks = winner.decisions.some((decision) => decision.markedBy);
  winner.decisions = winner.decisions.map((decision) => {
    const other = loser.decisions.find((row) => row.allocationId === decision.allocationId);
    return decision.markedBy && other && !other.markedBy ? structuredClone(other) : decision;
  });
  if (winnerHasModelMarks) {
    for (const decision of loser.decisions) {
      if (
        !decision.markedBy &&
        !winner.decisions.some((row) => row.allocationId === decision.allocationId)
      )
        winner.decisions.push(structuredClone(decision));
    }
  }
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
  if (existing.shownQuestionIds || incoming.shownQuestionIds) {
    winner.shownQuestionIds = [
      ...new Set([...(existing.shownQuestionIds ?? []), ...(incoming.shownQuestionIds ?? [])]),
    ].sort();
  }
  winner.paperSubmittedAt = existing.paperSubmittedAt ?? incoming.paperSubmittedAt;
  const allSubmitted = winner.responses.every((response) => response.submitted);
  if (allSubmitted && winner.status === 'answering') winner.status = 'marking';
  if (winner.mode === 'paper' && allSubmitted) {
    winner.revealedQuestionIds = winner.receipt.questions.map((question) => question.id);
  }
  if (
    existing.firstMarking ||
    incoming.firstMarking ||
    existing.firstMarkingConflicts ||
    incoming.firstMarkingConflicts
  ) {
    const snapshots = new Map<
      string,
      NonNullable<QuestionSetAttemptRecord['firstMarking']>[number]
    >();
    const disputed = new Set([
      ...(existing.disputedQuestionIds ?? []),
      ...(incoming.disputedQuestionIds ?? []),
    ]);
    const allSnapshots = new Map(
      [
        ...(existing.firstMarking ?? []),
        ...(incoming.firstMarking ?? []),
        ...(existing.firstMarkingConflicts ?? []),
        ...(incoming.firstMarkingConflicts ?? []),
      ].map((snapshot) => [canonicalJson(snapshot), snapshot]),
    );
    for (const snapshot of allSnapshots.values()) {
      const prior = snapshots.get(snapshot.questionId);
      const outcomes = (value: typeof snapshot) =>
        canonicalJson({
          source: value.source,
          schedulerConfigFingerprint: value.schedulerConfigFingerprint,
          decisions: value.decisions
            .map(({ markedBy: _markedBy, ...decision }) => decision)
            .sort((a, b) => a.allocationId.localeCompare(b.allocationId)),
        });
      if (prior && outcomes(prior) !== outcomes(snapshot)) disputed.add(snapshot.questionId);
      if (
        !prior ||
        snapshot.recordedAt < prior.recordedAt ||
        (snapshot.recordedAt === prior.recordedAt && canonicalJson(snapshot) < canonicalJson(prior))
      )
        snapshots.set(snapshot.questionId, structuredClone(snapshot));
    }
    winner.firstMarking = [...snapshots.values()].sort((a, b) =>
      a.questionId.localeCompare(b.questionId),
    );
    if (disputed.size) {
      winner.disputedQuestionIds = [...disputed].sort();
      winner.firstMarkingConflicts = [...allSnapshots.values()]
        .filter((snapshot) => disputed.has(snapshot.questionId))
        .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
    }
  }
  const undoTimes = [existing.undoneAt, incoming.undoneAt].filter(
    (value): value is number => value !== undefined,
  );
  if (undoTimes.length) winner.undoneAt = Math.min(...undoTimes);
  winner.updatedAt = Math.max(existing.updatedAt, incoming.updatedAt);
  if (attemptState(winner) !== attemptState(selected)) {
    winner.revisionId = mergedRevisionId(attemptState(winner));
  }
  return winner;
}
