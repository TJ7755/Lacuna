import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/repository';
import { createQuestionSet } from '../questions/questionSetRepository';
import { createConcept } from '../questions/repository';
import {
  startQuestionSetAttempt,
  submitQuestionSetPaper,
  saveQuestionSetMarking,
  getQuestionSetAttempt,
  completeQuestionSetAttempt,
} from '../questions/questionSetAttemptRepository';
import { summariseSelfMarking } from '../questions/questionSets';
import { gradeQuestionAttempt } from '../questions/grading';
import { deriveConceptApplicationSchedules } from '../questions/conceptPractice';
import { markJevAttempt } from './attempts';
import { createJevEngine } from './engine';
import { HOSTED_ACCESS_STORAGE_KEY } from '../ai/session/hostedTransport';

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
});
async function fixture(
  kind: 'written' | 'calculation' | 'multiple-choice' = 'written',
  marks = [1, 2],
) {
  const course = await createCourse('Biology');
  const concept = await createConcept(course.id, 'Water');
  const set = await createQuestionSet({
    id: 'set',
    courseId: course.id,
    title: 'Water',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'q',
        prompt: 'Explain osmosis',
        parts: [],
        answer: {
          maxMarks: marks.reduce((total, value) => total + value, 0),
          response:
            kind === 'multiple-choice'
              ? {
                  kind,
                  selection: 'single',
                  options: [
                    { id: 'one', content: 'A' },
                    { id: 'two', content: 'B' },
                  ],
                  correctOptionIds: ['one'],
                }
              : { kind },
          prerequisiteConceptIds: [],
          allocations: marks.map((maxMarks) => ({
            id: `a${maxMarks}`,
            criterion: `Water ${maxMarks}`,
            maxMarks,
            dimension: 'knowledge' as const,
            targetConceptIds: [concept.id],
          })),
        },
      },
    ],
  });
  const attempt = await startQuestionSetAttempt(set.id, 'paper');
  return { attempt: await submitQuestionSetPaper(attempt.id, attempt.revisionId), concept };
}
function engineWith(decide: (request: { maxMarks?: number }) => Promise<Response>) {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn(async (url, init) => {
    if (url.endsWith('/session'))
      return Response.json({ token: 'session', expiresAt: Date.now() + 60_000 });
    const request = JSON.parse(init.body);
    if (!request.allocations) return decide(request);
    const responses = await Promise.all(
      request.allocations.map(async (allocation: { maxMarks?: number }) =>
        (await decide(allocation)).json(),
      ),
    );
    return Response.json({
      model: 'jev-1.14.0',
      inputTokens: 20,
      decisions: responses.map(({ inputTokens: _inputTokens, ...decision }) => decision),
    });
  });
  const engine = createJevEngine({
    fetcher,
    cache: { get: async () => undefined, put: async () => {} },
  });
  engine.enable(1);
  return { engine, fetcher };
}
const result = (value: number | null) =>
  Response.json({
    value,
    model: 'jev-1.14.0',
    confidence: value === null ? 0.5 : 0.98,
    inputTokens: 10,
  });
it('confident marks carry provenance and feed summaries, grading and concept schedules', async () => {
  const { attempt, concept } = await fixture();
  const { engine } = engineWith(async (request) => result(request.maxMarks!));
  await markJevAttempt(attempt.id, engine);
  const marked = (await getQuestionSetAttempt(attempt.id))!;
  expect(marked.decisions).toHaveLength(2);
  expect(marked.decisions.every((line) => line.markedBy?.by === 'jev')).toBe(true);
  const summary = summariseSelfMarking(marked.receipt, marked.decisions);
  expect(summary.status).toBe('complete');
  expect(
    gradeQuestionAttempt({
      marksEarned: summary.total.awarded,
      marksAvailable: summary.total.available,
      hasUndeterminedVerdict: false,
      hasUnresolvedDispute: false,
    }),
  ).toBe(3);
  const complete = await completeQuestionSetAttempt(marked.id, marked.revisionId);
  expect(deriveConceptApplicationSchedules([complete]).get(concept.id)?.reps).toBe(1);
});
it('leaves unsure lines undecided and applies explicit zero marks', async () => {
  const { attempt } = await fixture();
  const { engine } = engineWith(async (request) => result(request.maxMarks === 1 ? 0 : null));
  await markJevAttempt(attempt.id, engine);
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([
    expect.objectContaining({
      allocationId: 'a1',
      status: 'awarded',
      marks: 0,
      markedBy: expect.any(Object),
    }),
  ]);
});
it('never replaces a learner decision made before or during marking, and clears provenance on override', async () => {
  const { attempt } = await fixture();
  const initial = await saveQuestionSetMarking(attempt.id, attempt.revisionId, {
    ...attempt,
    decisions: [{ allocationId: 'a1', status: 'unsure' }],
  });
  const { engine, fetcher } = engineWith(async () => {
    const current = (await getQuestionSetAttempt(initial.id))!;
    await saveQuestionSetMarking(current.id, current.revisionId, {
      ...current,
      decisions: [...current.decisions, { allocationId: 'a2', status: 'awarded', marks: 0 }],
    });
    return result(2);
  });
  await markJevAttempt(attempt.id, engine);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([
    { allocationId: 'a1', status: 'unsure' },
    { allocationId: 'a2', status: 'awarded', marks: 0 },
  ]);
});
it('does not mark when off, without consent or without a code', async () => {
  const { attempt } = await fixture();
  const fetcher = vi.fn();
  const engine = createJevEngine({ fetcher });
  await markJevAttempt(attempt.id, engine);
  engine.enable(0);
  await markJevAttempt(attempt.id, engine);
  engine.enable(1);
  await markJevAttempt(attempt.id, engine);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
});
it('drops model provenance when the learner changes an award, including stale UI copies', async () => {
  const { attempt } = await fixture();
  const { engine } = engineWith(async (request) => result(request.maxMarks!));
  await markJevAttempt(attempt.id, engine);
  const current = (await getQuestionSetAttempt(attempt.id))!;
  const changed = await saveQuestionSetMarking(current.id, current.revisionId, {
    ...current,
    decisions: current.decisions.map((row) =>
      row.allocationId === 'a1' ? { ...row, status: 'awarded' as const, marks: 0 } : row,
    ),
  });
  expect(changed.decisions[0]).toEqual({ allocationId: 'a1', status: 'awarded', marks: 0 });
});
it('keeps a learner override when a newer peer revision contains a Jev award', async () => {
  const { attempt } = await fixture();
  const { engine } = engineWith(async (request) => result(request.maxMarks!));
  await markJevAttempt(attempt.id, engine);
  const model = (await getQuestionSetAttempt(attempt.id))!;
  const learner = {
    ...structuredClone(model),
    revisionId: 'learner',
    decisions: [{ allocationId: 'a1', status: 'awarded' as const, marks: 0 }, model.decisions[1]],
  };
  const newerModel = { ...model, revisionId: 'newer-model', updatedAt: model.updatedAt + 1 };
  const { mergeQuestionSetAttemptPair } = await import('../questions/questionSetAttemptMerge');
  expect(mergeQuestionSetAttemptPair(learner, newerModel).decisions[0]).toEqual({
    allocationId: 'a1',
    status: 'awarded',
    marks: 0,
  });
  expect(mergeQuestionSetAttemptPair(newerModel, learner)).toEqual(
    mergeQuestionSetAttemptPair(learner, newerModel),
  );
});
it.each(['calculation', 'multiple-choice'] as const)(
  'leaves %s responses on their existing paths',
  async (kind) => {
    const { attempt } = await fixture(kind);
    const { engine, fetcher } = engineWith(async () => result(1));
    await markJevAttempt(attempt.id, engine);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
  },
);
it('resumes safely after abandoning a low-confidence run with no persisted work queue', async () => {
  const { attempt } = await fixture();
  const abandoned = engineWith(async () => result(null));
  await markJevAttempt(attempt.id, abandoned.engine);
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
  const resumed = engineWith(async (request) => result(request.maxMarks!));
  await markJevAttempt(attempt.id, resumed.engine);
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toHaveLength(2);
});
it('retries a stale model write through the repository without touching learner state', async () => {
  const { attempt } = await fixture();
  const { applyJevAllocationDecision, QuestionSetAttemptRevisionConflictError } =
    await import('../questions/questionSetAttemptRepository');
  const learner = await saveQuestionSetMarking(attempt.id, attempt.revisionId, {
    ...attempt,
    decisions: [{ allocationId: 'a1', status: 'awarded', marks: 0 }],
  });
  learner.shownQuestionIds = [];
  await db.questionSetAttempts.put(learner);
  const decision = {
    allocationId: 'a2',
    status: 'awarded' as const,
    marks: 2,
    markedBy: { by: 'jev' as const, model: 'jev-1.14.0', confidence: 0.97, markedAt: Date.now() },
  };
  expect(
    await applyJevAllocationDecision(attempt.id, attempt.revisionId, 'q', decision, () => true),
  ).toBe(true);
  const current = (await getQuestionSetAttempt(attempt.id))!;
  expect(current.decisions).toEqual([...learner.decisions, decision]);
  expect(current.responses).toEqual(learner.responses);
  expect(current.activeNodeId).toBe(learner.activeNodeId);
  expect(current.activeAllocationId).toBe(learner.activeAllocationId);
  expect({ ...current, decisions: [], revisionId: '', updatedAt: 0 }).toEqual({
    ...learner,
    decisions: [],
    revisionId: '',
    updatedAt: 0,
  });
  await expect(
    saveQuestionSetMarking(attempt.id, attempt.revisionId, { ...attempt, decisions: [] }),
  ).rejects.toBeInstanceOf(QuestionSetAttemptRevisionConflictError);
});
it('keeps a peer learner line when a later model revision adds a different allocation', async () => {
  const { attempt } = await fixture();
  const { mergeQuestionSetAttemptPair } = await import('../questions/questionSetAttemptMerge');
  const learner = {
    ...structuredClone(attempt),
    revisionId: 'learner',
    decisions: [{ allocationId: 'a1', status: 'awarded' as const, marks: 0 }],
  };
  const model = {
    ...structuredClone(attempt),
    revisionId: 'model',
    updatedAt: attempt.updatedAt + 1,
    decisions: [
      {
        allocationId: 'a2',
        status: 'awarded' as const,
        marks: 2,
        markedBy: {
          by: 'jev' as const,
          model: 'jev-1.14.0',
          confidence: 0.98,
          markedAt: Date.now(),
        },
      },
    ],
  };
  const merged = mergeQuestionSetAttemptPair(learner, model);
  expect(merged.decisions).toEqual(
    expect.arrayContaining([...learner.decisions, ...model.decisions]),
  );
  expect(mergeQuestionSetAttemptPair(model, learner)).toEqual(merged);
});
it('does not dispute equal first-marking outcomes solely because their model provenance differs', async () => {
  const { attempt } = await fixture();
  const { engine } = engineWith(async (request) => result(request.maxMarks!));
  await markJevAttempt(attempt.id, engine);
  const marked = (await getQuestionSetAttempt(attempt.id))!;
  const complete = await completeQuestionSetAttempt(marked.id, marked.revisionId);
  const peer = structuredClone(complete);
  peer.revisionId = 'peer';
  peer.updatedAt++;
  peer.firstMarking![0].recordedAt++;
  for (const decision of peer.firstMarking![0].decisions) decision.markedBy!.markedAt++;
  const { mergeQuestionSetAttemptPair } = await import('../questions/questionSetAttemptMerge');
  expect(mergeQuestionSetAttemptPair(complete, peer).disputedQuestionIds).toBeUndefined();
});
it('sends all undecided allocations together rather than paying for one request per line', async () => {
  const { attempt } = await fixture();
  const { engine, fetcher } = engineWith(async (request) => result(request.maxMarks!));
  await markJevAttempt(attempt.id, engine);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1].body).allocations).toHaveLength(2);
});
it('drains a new practice submission made while an earlier batch is in flight', async () => {
  const { attempt: template } = await fixture();
  const first = template.receipt.questions[0];
  const second = {
    ...structuredClone(first),
    id: 'q-next',
    answer: {
      ...first.answer!,
      allocations: first.answer!.allocations.map((row) => ({ ...row, id: `${row.id}-next` })),
    },
  };
  const set = await createQuestionSet({
    ...template.receipt,
    id: 'queued-set',
    questions: [first, second],
  });
  const repository = await import('../questions/questionSetAttemptRepository');
  let attempt = await startQuestionSetAttempt(set.id, 'practice');
  attempt = await repository.submitPracticeQuestion(attempt.id, attempt.revisionId, first.id);
  let submittedAgain = false;
  const { engine } = engineWith(async (request) => {
    if (!submittedAgain) {
      submittedAgain = true;
      const current = (await getQuestionSetAttempt(attempt.id))!;
      await repository.submitPracticeQuestion(current.id, current.revisionId, second.id);
      void markJevAttempt(attempt.id, engine);
    }
    return result(request.maxMarks!);
  });
  await markJevAttempt(attempt.id, engine);
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toHaveLength(4);
});

it('abandons submitted lines encountered during backoff instead of queueing them for recovery', async () => {
  const { attempt } = await fixture();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-21T10:00:00Z'));
  try {
    localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
    let failing = true;
    const fetcher = vi.fn(async (url, init) =>
      url.endsWith('/session')
        ? Response.json({ token: 'session', expiresAt: Date.now() + 3_600_000 })
        : failing
          ? new Response('', { status: 503 })
          : Response.json({
              model: 'jev-1.14.0',
              inputTokens: 20,
              decisions: JSON.parse(init.body).allocations.map(() => ({
                model: 'jev-1.14.0',
                value: 1,
                confidence: 0.98,
              })),
            }),
    );
    const engine = createJevEngine({
      fetcher,
      cache: { get: async () => undefined, put: async () => {} },
    });
    engine.enable(1);
    await engine.markTyped({ cardId: 'c', prompt: 'Q', expected: 'A', answer: 'B' });
    expect(engine.status()).toMatchObject({ state: 'paused', reason: 'service-disabled' });
    const calls = fetcher.mock.calls.length;
    await markJevAttempt(attempt.id, engine);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    clock.mockReturnValue(Date.parse('2026-10-21T10:01:00Z'));
    failing = false;
    await engine.decideAllocations([
      { prompt: 'Q', criterion: 'C', explanation: '', maxMarks: 1, answer: 'A' },
    ]);
    expect(engine.status().state).toBe('ready');
    const recoveredCalls = fetcher.mock.calls.length;
    await markJevAttempt(attempt.id, engine);
    expect(fetcher).toHaveBeenCalledTimes(recoveredCalls);
    expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
  } finally {
    clock.mockRestore();
  }
});

it('leaves a timed-out attempt manual without pausing or queueing its lines', async () => {
  const { attempt } = await fixture();
  const { engine, fetcher } = engineWith(() => new Promise<Response>(() => {}));
  const schedule = globalThis.setTimeout;
  const timer = vi
    .spyOn(globalThis, 'setTimeout')
    .mockImplementation((callback, delay, ...args) =>
      schedule(callback, delay === 30_000 ? 0 : delay, ...args),
    );
  try {
    await markJevAttempt(attempt.id, engine);
    expect(engine.status().state).toBe('ready');
    expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
    const calls = fetcher.mock.calls.length;
    await markJevAttempt(attempt.id, engine);
    expect(fetcher).toHaveBeenCalledTimes(calls);
  } finally {
    timer.mockRestore();
  }
});

it('marks only the criterion the learner opens', async () => {
  const { attempt } = await fixture();
  const { engine, fetcher } = engineWith(async (request) => result(request.maxMarks!));
  await markJevAttempt(attempt.id, engine, 'a2');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1].body).allocations).toEqual([
    expect.objectContaining({ criterion: 'Water 2', maxMarks: 2 }),
  ]);
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([
    expect.objectContaining({ allocationId: 'a2', marks: 2, markedBy: expect.any(Object) }),
  ]);
});

it('sends an opened criterion once however often it is revisited', async () => {
  const { attempt } = await fixture();
  const { engine, fetcher } = engineWith(async () => result(null));
  await Promise.all([
    markJevAttempt(attempt.id, engine, 'a1'),
    markJevAttempt(attempt.id, engine, 'a1'),
  ]);
  await markJevAttempt(attempt.id, engine, 'a1');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
});

it('does not mark criteria when an attempt is submitted', async () => {
  const fetcher = vi.fn(async () => Response.json({}));
  vi.stubGlobal('fetch', fetcher);
  const { jevEngine } = await import('./engine');
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  jevEngine.enable(1);
  try {
    const { attempt } = await fixture();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher).not.toHaveBeenCalled();
    expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
  } finally {
    jevEngine.disable();
    vi.unstubAllGlobals();
  }
});

it('holds a quick verdict on an opened criterion until it has visibly been judged', async () => {
  const { attempt } = await fixture();
  const { engine } = engineWith(async (request) => result(request.maxMarks!));
  const started = Date.now();
  const marking = markJevAttempt(attempt.id, engine, 'a1', 80);
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
  await marking;
  expect(Date.now() - started).toBeGreaterThanOrEqual(80);
  expect((await getQuestionSetAttempt(attempt.id))!.decisions).toHaveLength(1);
});

it('persists all six criterion verdicts arriving together while requests stay independent', async () => {
  const { attempt } = await fixture('written', [1, 2, 3, 4, 5, 6]);
  const releases: Array<() => void> = [];
  const { engine, fetcher } = engineWith(
    (request) => new Promise((resolve) => releases.push(() => resolve(result(request.maxMarks!)))),
  );
  const marking = Promise.all(
    [1, 2, 3, 4, 5, 6].map((index) => markJevAttempt(attempt.id, engine, `a${index}`)),
  );
  await vi.waitFor(() => expect(releases).toHaveLength(6));
  releases.forEach((release) => release());
  await marking;
  expect(fetcher).toHaveBeenCalledTimes(7);
  const marked = (await getQuestionSetAttempt(attempt.id))!;
  expect(marked.decisions.map((row) => row.allocationId).sort()).toEqual([
    'a1',
    'a2',
    'a3',
    'a4',
    'a5',
    'a6',
  ]);
  expect(marked.decisions.every((row) => row.markedBy?.by === 'jev')).toBe(true);
});

it.each(['conflict', 'storage error'] as const)(
  'allows a confident verdict that could not be applied (%s) to recover on a revisit',
  async (failure) => {
    const { attempt } = await fixture();
    const { engine } = engineWith(async (request) => result(request.maxMarks!));
    const repository = await import('../questions/questionSetAttemptRepository');
    const apply = vi.spyOn(repository, 'applyJevAllocationDecision');
    if (failure === 'conflict') apply.mockResolvedValueOnce(false);
    else apply.mockRejectedValueOnce(new Error('Storage write failed'));
    try {
      await markJevAttempt(attempt.id, engine, 'a1');
      expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
      await markJevAttempt(attempt.id, engine, 'a1');
      expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([
        expect.objectContaining({ allocationId: 'a1', marks: 1 }),
      ]);
    } finally {
      apply.mockRestore();
    }
  },
);

it('discards a held verdict after disabling and re-enabling Jev, while fresh work remains valid', async () => {
  const { attempt } = await fixture();
  const { engine, fetcher } = engineWith(async (request) => result(request.maxMarks!));
  const schedule = globalThis.setTimeout;
  let release!: () => void;
  const timer = vi
    .spyOn(globalThis, 'setTimeout')
    .mockImplementation((callback, delay, ...args) => {
      if (delay !== undefined && delay > 9_000 && delay <= 10_000) {
        release = () => callback(...args);
        return schedule(() => {}, 0);
      }
      return schedule(callback, delay, ...args);
    });
  try {
    const marking = markJevAttempt(attempt.id, engine, 'a1', 10_000);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    engine.disable();
    engine.enable(1);
    release();
    await marking;
    expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([]);
    await markJevAttempt(attempt.id, engine, 'a1');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await markJevAttempt(attempt.id, engine, 'a2');
    expect((await getQuestionSetAttempt(attempt.id))!.decisions).toEqual([
      expect.objectContaining({ allocationId: 'a2', marks: 2 }),
    ]);
  } finally {
    timer.mockRestore();
  }
});
