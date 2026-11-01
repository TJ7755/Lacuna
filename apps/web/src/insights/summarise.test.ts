import { describe, expect, it } from 'vitest';
import type { FixedQuestionDefinition, QuestionAttempt } from '@lacuna/core/questions/types';
import {
  INSIGHTS_SCHEMA_VERSION,
  summariseForInsights,
  type InsightsEvidence,
  type InsightsReview,
} from './summarise';

// Fixture tests for the on-device weekly summariser (issue #589). The evidence layer
// is synthetic: caller-filtered reviews and attempts for a shared copy of a published
// course, identified by a share link id rather than any device or user identifier.

const WEEK = '2026-W42';
const SHARE_ID = 'b'.repeat(32);
const NOW = Date.UTC(2026, 9, 12);

function question(overrides: Partial<FixedQuestionDefinition> = {}): FixedQuestionDefinition {
  return {
    id: 'question-cells',
    courseId: 'course-local',
    primaryLessonId: null,
    additionalLessonIds: [],
    name: 'Expand 3(x+1)',
    tags: [],
    suspended: false,
    contentVersion: 1,
    contentRevisionId: 'content-1',
    authoringRevisionId: 'authoring-1',
    authoringUpdatedAt: NOW,
    scheduleEpoch: { id: 'epoch-1', startedAt: NOW, reason: 'created', baseline: { kind: 'new' } },
    scheduleUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    kind: 'fixed',
    prompt: 'Expand 3(x+1)',
    payload: {
      v: 1,
      kind: 'working',
      scheme: [
        { marks: 2, label: 'M1: uses brackets', kind: 'waypoint', expression: '(x+1)*3' },
        { marks: 3, label: 'M2: multiplies', kind: 'waypoint', expression: '3*x' },
      ],
    },
    explanation: 'Multiply out the bracket.',
    explanationStatus: 'authored',
    ...overrides,
  };
}

function workingAttempt(overrides: Partial<QuestionAttempt> = {}): QuestionAttempt {
  return {
    id: 'attempt-cells-1',
    questionId: 'question-cells',
    courseId: 'course-local',
    contentVersion: 1,
    contentRevisionId: 'content-1',
    scheduleEpochId: 'epoch-1',
    purpose: 'post-instruction',
    shownAt: 1_000,
    answeredAt: 2_000,
    updatedAt: 2_000,
    status: 'answered',
    receiptOrigin: 'native',
    renderedPrompt: 'Expand 3(x+1)',
    resolvedPayload: {
      v: 1,
      kind: 'working',
      scheme: [
        { marks: 2, label: 'M1: uses brackets', kind: 'waypoint', expression: '(x+1)*3' },
        { marks: 3, label: 'M2: multiplies', kind: 'waypoint', expression: '3*x' },
      ],
    },
    renderedExplanation: 'Multiply out the bracket.',
    submittedAnswer: '3x + 3 and 3x',
    marksEarned: 2,
    marksAvailable: 5,
    lineVerdicts: [
      { studentLine: '3x + 3', matchedLineIndex: 0, marksEarned: 2 },
      { studentLine: '3x', matchedLineIndex: 1, marksEarned: 0 },
    ],
    grade: 2,
    scheduleEffect: { kind: 'replay', grade: 2 },
    sessionId: 'session-1',
    ...overrides,
  };
}

function review(conceptId: string, retained: boolean): InsightsReview {
  return { conceptId, retained };
}

function standardEvidence(overrides: Partial<InsightsEvidence> = {}): InsightsEvidence {
  return {
    reviews: [
      review('concept-cells', true),
      review('concept-cells', true),
      review('concept-cells', false),
      review('concept-cells', true),
      review('concept-envelope', false),
    ],
    attempts: [
      workingAttempt(),
      workingAttempt({
        id: 'attempt-cells-2',
        marksEarned: 4,
        lineVerdicts: [
          { studentLine: '3(x+1)', matchedLineIndex: 0, marksEarned: 1 },
          { studentLine: '3(x+1) = 3x + 3', matchedLineIndex: 1, marksEarned: 3 },
        ],
      }),
      // A numeric item earns no criterion lines, so it never reaches `cr`.
      workingAttempt({
        id: 'attempt-numbers-1',
        questionId: 'question-numbers',
        resolvedPayload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '42' } },
        lineVerdicts: undefined,
        marksEarned: 1,
        marksAvailable: 1,
        grade: 3,
        scheduleEffect: { kind: 'replay', grade: 3 },
      }),
      // Neither abandoned nor undone work contributes scored evidence.
      workingAttempt({
        id: 'attempt-cells-4',
        status: 'abandoned',
        answeredAt: undefined,
        abandonedAt: 3_000,
      }),
    ],
    questions: [question()],
    ...overrides,
  };
}

describe('summariseForInsights', () => {
  it('reduces a week of study for a shared copy into counted cells', () => {
    const summary = summariseForInsights({
      week: WEEK,
      shareId: SHARE_ID,
      evidence: standardEvidence(),
    });
    expect(summary).toEqual({
      v: 1,
      s: SHARE_ID,
      w: WEEK,
      a: true,
      co: [
        { i: 'concept-cells', n: 3, d: 4 },
        { i: 'concept-envelope', n: 0, d: 1 },
      ],
      cr: [
        { i: 'question-cells:v1:criterion:0', n: 3, d: 4 },
        { i: 'question-cells:v1:criterion:1', n: 3, d: 6 },
      ],
    });
    if (!summary) throw new Error('expected a summary');
    expect(Object.keys(summary).sort()).toEqual(['a', 'co', 'cr', 's', 'v', 'w']);
    for (const cell of [...summary.co, ...summary.cr]) {
      expect(Object.keys(cell).sort()).toEqual(['d', 'i', 'n']);
    }
  });

  it('treats only completed engagement as activity', () => {
    // An attempt that the learner undid, with no reviews: present in local evidence,
    // but neither an active week nor a scored cell.
    expect(
      summariseForInsights({
        week: WEEK,
        shareId: SHARE_ID,
        evidence: {
          reviews: [],
          attempts: [workingAttempt({ undoneAt: 4_000 })],
          questions: [question()],
        },
      }),
    ).toEqual({
      v: 1,
      s: SHARE_ID,
      w: WEEK,
      a: false,
      co: [],
      cr: [],
    });
  });

  it('summarises nothing when the course has no share link id', () => {
    expect(
      summariseForInsights({
        week: WEEK,
        shareId: null,
        evidence: standardEvidence(),
      }),
    ).toBeNull();
  });

  it('summarises a silent week as an inactive row', () => {
    expect(
      summariseForInsights({
        week: WEEK,
        shareId: SHARE_ID,
        evidence: { reviews: [], attempts: [], questions: [question()] },
      }),
    ).toEqual({
      v: 1,
      s: SHARE_ID,
      w: WEEK,
      a: false,
      co: [],
      cr: [],
    });
  });

  it('keeps free text, attempt contents and timings out of the wire format', () => {
    const serialised = JSON.stringify(
      summariseForInsights({
        week: WEEK,
        shareId: SHARE_ID,
        evidence: standardEvidence(),
      }),
    );
    for (const leak of [
      'Paper 1',
      'Expand 3(x+1)',
      'Multiply out the bracket.',
      'M1: uses brackets',
      'M2: multiplies',
      '3x + 3',
      'scheme',
      'shownAt',
      'updatedAt',
      'sessionId',
      'courseId',
    ]) {
      expect(serialised).not.toContain(leak);
    }
  });

  it('orders evidence-independently', () => {
    const evidence = standardEvidence();
    const reversed: InsightsEvidence = {
      reviews: [...evidence.reviews].reverse(),
      attempts: [...evidence.attempts].reverse(),
      questions: evidence.questions,
    };
    expect(
      summariseForInsights({
        week: WEEK,
        shareId: SHARE_ID,
        evidence: reversed,
      }),
    ).toEqual(
      summariseForInsights({
        week: WEEK,
        shareId: SHARE_ID,
        evidence,
      }),
    );
  });

  it('stays under the relay size budget for a year-scale course', () => {
    const reviewedCourse: InsightsEvidence = {
      reviews: Array.from({ length: 30 }, (_, index): InsightsReview => ({
        conceptId: `concept-biology-${index}`,
        retained: index % 4 !== 0,
      })),
      attempts: Array.from({ length: 30 }, (_, index) =>
        workingAttempt({ id: `attempt-${index}`, questionId: `question-${index}` }),
      ),
      questions: Array.from({ length: 30 }, (_, index) => question({ id: `question-${index}` })),
    };
    const summary = summariseForInsights({
      week: WEEK,
      shareId: SHARE_ID,
      evidence: reviewedCourse,
    });
    const bytes = new TextEncoder().encode(JSON.stringify(summary)).length;
    expect(bytes).toBeLessThan(1024 * 8);
  });

  it('rejects a malformed week label rather than transmitting it', () => {
    expect(() =>
      summariseForInsights({
        week: 'October week 3',
        shareId: SHARE_ID,
        evidence: { reviews: [], attempts: [], questions: [] },
      }),
    ).toThrow(/ISO 8601 label/);
  });

  it('pins the schema version constant', () => {
    expect(INSIGHTS_SCHEMA_VERSION).toBe(1);
  });
});
