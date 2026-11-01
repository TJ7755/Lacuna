import { expect, it } from 'vitest';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import { emptyQuestionSchedule } from './scheduler';
import { deriveTechniqueSchedules, techniquePracticeStatus } from './techniqueSchedule';

function attempt(id: string, marks = 1): QuestionSetAttemptRecord {
  return {
    id,
    courseId: 'course',
    questionSetId: 'set',
    status: 'complete',
    responses: [],
    decisions: [],
    annotations: [],
    corrections: [],
    reflection: { reasons: [], note: '' },
    revealedQuestionIds: [],
    activeNodeId: 'q',
    activeAllocationId: null,
    revisionId: id,
    createdAt: 1,
    updatedAt: 1,
    mode: 'practice',
    assistance: [],
    undoneAt: undefined,
    receipt: {
      id: 'set',
      courseId: 'course',
      title: 'Test',
      lessonIds: [],
      assessmentIds: [],
      contentRevisionId: 'content',
      contentVersion: 1,
      createdAt: 1,
      updatedAt: 1,
      questions: [
        {
          id: 'q',
          prompt: id,
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'a',
                maxMarks: 1,
                criterion: 'Criterion',
                dimension: 'application',
                targetConceptIds: [],
                techniqueTags: {
                  taxonomyId: 'science-techniques',
                  taxonomyVersion: 1,
                  techniqueIds: ['graph-interpretation'],
                  provenance: { source: 'author' },
                },
              },
            ],
          },
        },
      ],
    },
    firstMarking: [
      {
        questionId: 'q',
        source: 'self-mark',
        schedulerVersion: 'fsrs-6-question-v1',
        schedulerConfigFingerprint: 'fixture',
        recordedAt: 1_800_000_000_000,
        gradeMappingVersion: 'full-good-otherwise-again-v1',
        schedulerConfig: defaultFsrsParameters(),
        decisions: [{ allocationId: 'a', status: 'awarded', marks }],
      },
    ],
  };
}

it('replay is permutation invariant and never grants repeated presentations extra reviews', () => {
  for (let length = 1; length <= 40; length++) {
    const rows = Array.from({ length }, (_, index) => attempt(String(index).padStart(3, '0')));
    for (const row of rows) row.receipt.questions[0].prompt = 'Identical presentation';
    const forward = deriveTechniqueSchedules(rows);
    expect(forward).toEqual(deriveTechniqueSchedules([...rows].reverse()));
    expect(forward.get('graph-interpretation')?.reps).toBe(1);
  }
});

it('inadmissible evidence cannot create memory and undo removes its effect', () => {
  const controls = [
    (row: QuestionSetAttemptRecord) => {
      row.undoneAt = 1;
    },
    (row: QuestionSetAttemptRecord) => {
      row.mode = 'paper';
    },
    (row: QuestionSetAttemptRecord) => {
      row.disputedQuestionIds = ['q'];
    },
    (row: QuestionSetAttemptRecord) => {
      row.firstMarkingConflicts = row.firstMarking;
    },
    (row: QuestionSetAttemptRecord) => {
      row.assistance = [{ nodeId: 'q', kind: 'answer-revealed', occurredAt: 1 }];
    },
    (row: QuestionSetAttemptRecord) => {
      row.firstMarking![0].decisions[0] = { allocationId: 'a', status: 'unsure' };
    },
  ];
  for (const change of controls) {
    const row = attempt('a');
    change(row);
    expect(deriveTechniqueSchedules([row]).size).toBe(0);
  }
  expect(
    deriveTechniqueSchedules([attempt('valid')]).get('graph-interpretation')?.stability,
  ).toBeGreaterThan(0);
});

it('rejects fractional, negative and excessive criterion marks', () => {
  for (const marks of [-1, 0.5, 2, Infinity, NaN])
    expect(deriveTechniqueSchedules([attempt('a', marks)]).size).toBe(0);
});

it('exam timing never postpones ordinary due and remains fixed as time advances', () => {
  for (let days = 1; days <= 100; days++) {
    const now = 1_800_000_000_000;
    const exam = now + days * 86_400_000;
    const schedule = {
      ...emptyQuestionSchedule(),
      due: exam + 86_400_000,
      lastReviewed: now,
      stability: days,
    };
    const first = techniquePracticeStatus(schedule, defaultFsrsParameters(), now, exam);
    const later = techniquePracticeStatus(schedule, defaultFsrsParameters(), now + 1, exam);
    expect(first.dueAt).toBe(exam - 1);
    expect(later.dueAt).toBe(first.dueAt);
    expect(techniquePracticeStatus(schedule, defaultFsrsParameters(), exam - 1, exam).due).toBe(
      true,
    );
    expect(techniquePracticeStatus(schedule, defaultFsrsParameters(), exam, exam).dueAt).toBe(
      schedule.due,
    );
    expect(
      techniquePracticeStatus({ ...schedule, due: now }, defaultFsrsParameters(), now, exam).dueAt,
    ).toBe(now);
  }
});

it('previous active and drafted presentations cannot become independent evidence', () => {
  for (const exposure of ['active', 'draft'] as const) {
    const earlier = attempt('earlier');
    const later = attempt('later');
    earlier.receipt.questions[0].prompt = later.receipt.questions[0].prompt;
    earlier.createdAt = 0;
    earlier.firstMarking = [];
    earlier.shownQuestionIds = undefined;
    if (exposure === 'draft') {
      earlier.activeNodeId = 'other';
      earlier.responses = [{ nodeId: 'q', draft: { kind: 'written', text: 'A draft' } }];
    }
    expect(deriveTechniqueSchedules([later, earlier]).size).toBe(0);
  }
});
