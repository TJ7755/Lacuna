import { describe, expect, it } from 'vitest';
import type { QuestionSetPracticeNode } from '../db/types';

import { mergeSnapshots } from './mergeSnapshots';
import type { QuestionSetAttemptRecord } from '../questions/questionSetAttempts';

import {
  course,
  concept,
  backup,
  asset,
  authoredSet,
  setAttempt,
} from './mergeSnapshots.questions.testFixtures';

describe('Question Set activity, receipts and deletion peer merge', () => {
  it('retains whole-record LWW membership/order, canonical equal-time ties and immutable attempts', () => {
    const lesson = {
      id: 'lesson',
      courseId: 'course-1',
      name: 'Lesson',
      isExtension: false,
      orderIndex: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    const node: QuestionSetPracticeNode = {
      id: 'activity',
      courseId: 'course-1',
      type: 'question-set',
      name: 'Practice',
      questionSetIds: ['set-c', 'set-1', 'set-b'],
      afterLessonId: lesson.id,
      createdAt: 1,
      updatedAt: 2,
    };
    const base = backup({
      lessons: [lesson],
      practiceNodes: [node],
      questionSets: [
        authoredSet(),
        { ...authoredSet(), id: 'set-b' },
        { ...authoredSet(), id: 'set-c' },
      ],
      questionSetAttempts: [setAttempt()],
    });
    for (const updatedAt of [2, 3]) {
      const winner = { ...node, questionSetIds: ['set-c', 'set-b'], updatedAt };
      const peer = { ...base, practiceNodes: [winner] };
      for (const merged of [mergeSnapshots(base, peer), mergeSnapshots(peer, base)]) {
        expect(merged.practiceNodes).toEqual([winner]);
        expect(merged.questionSetAttempts).toEqual(base.questionSetAttempts);
      }
    }
    const removed = {
      ...base,
      questionSets: base.questionSets?.filter((set) => set.id !== 'set-b'),
      tombstones: [{ table: 'questionSets' as const, recordId: 'set-b', deletedAt: 100 }],
    };
    expect(() => mergeSnapshots(base, removed)).toThrow('missing Question Set');
  });

  it.each(['prior course-update damage', 'concurrent peer deletion'])(
    'recovers referenced Concepts from an intact peer after %s',
    (scenario) => {
      const set = authoredSet();
      const receipt = setAttempt();
      const intact = backup({
        questions: [],
        questionConcepts: [],
        questionSets: scenario === 'prior course-update damage' ? [set] : [],
        questionSetAttempts: [receipt],
      });
      const damaged = backup({
        concepts: [],
        questions: [],
        questionConcepts: [],
        questionSets: [set],
        questionSetAttempts: [receipt],
        tombstones: [{ table: 'concepts', recordId: 'concept-1', deletedAt: 50 }],
      });
      const merged = mergeSnapshots(damaged, intact);
      expect(merged.concepts).toEqual([concept()]);
      expect(merged.questionSets).toEqual([set]);
      expect(merged.questionSetAttempts).toEqual([receipt]);
      expect(merged.tombstones).toContainEqual(damaged.tombstones![0]);
      expect(mergeSnapshots(intact, damaged)).toEqual(merged);
      expect(mergeSnapshots(merged, damaged)).toEqual(merged);
      expect(mergeSnapshots(merged, merged)).toEqual(merged);
    },
  );

  it('keeps deletion evidence so later set deletion converges across three peers', () => {
    const authored = backup({ questions: [], questionConcepts: [], questionSets: [authoredSet()] });
    const conceptDeleted = backup({
      concepts: [],
      questions: [],
      questionConcepts: [],
      tombstones: [{ table: 'concepts', recordId: 'concept-1', deletedAt: 50 }],
    });
    const setDeleted = backup({
      concepts: [],
      questions: [],
      questionConcepts: [],
      tombstones: [{ table: 'questionSets', recordId: 'set-1', deletedAt: 60 }],
    });
    const recoveredThenDeleted = mergeSnapshots(
      mergeSnapshots(authored, conceptDeleted),
      setDeleted,
    );
    const deletedThenRecovered = mergeSnapshots(
      authored,
      mergeSnapshots(conceptDeleted, setDeleted),
    );
    expect(recoveredThenDeleted).toEqual(deletedThenRecovered);
    expect(recoveredThenDeleted.concepts).toEqual([]);
    expect(recoveredThenDeleted.questionSets).toEqual([]);
  });

  it('does not invent missing Concepts or accept cross-Course replacements', () => {
    const damaged = backup({
      concepts: [],
      questions: [],
      questionConcepts: [],
      questionSets: [authoredSet()],
    });
    expect(() => mergeSnapshots(damaged, damaged)).toThrow('missing or cross-Course Concept');
    expect(() =>
      mergeSnapshots(
        damaged,
        backup({
          questions: [],
          questionConcepts: [],
          concepts: [
            {
              ...concept(),
              scope: 'course',
              provisional: false,
              courseId: 'another-course',
              scopeKey: 'course:another-course',
            },
          ],
        }),
      ),
    ).toThrow('missing or cross-Course Concept');
  });

  it('honours Concept deletion when the referencing Question Set was also deleted', () => {
    const intact = backup({ questions: [], questionConcepts: [], questionSets: [authoredSet()] });
    const deleted = backup({
      concepts: [],
      questions: [],
      questionConcepts: [],
      questionSets: [],
      tombstones: [
        { table: 'concepts', recordId: 'concept-1', deletedAt: 50 },
        { table: 'questionSets', recordId: 'set-1', deletedAt: 50 },
      ],
    });
    const merged = mergeSnapshots(intact, deleted);
    expect(merged.concepts).toEqual([]);
    expect(merged.questionSets).toEqual([]);
    expect(merged.tombstones).toEqual(deleted.tombstones);
  });

  it('honours attempt deletion receipts even when a newer Course edit survives', () => {
    const attempt = setAttempt();
    const deletion = { table: 'questionSetAttempts', recordId: attempt.id, deletedAt: 30 };
    const deleted = backup({
      courses: [],
      concepts: [],
      questions: [],
      questionConcepts: [],
      tombstones: [deletion, { table: 'courses', recordId: 'course-1', deletedAt: 30 }],
    });
    const edited = backup({ courses: [course({ updatedAt: 40 })], questionSetAttempts: [attempt] });

    const merged = mergeSnapshots(deleted, edited);

    expect(merged.courses).toHaveLength(1);
    expect(merged.questionSetAttempts).toEqual([]);
    expect(merged.tombstones).toContainEqual(deletion);
    expect(mergeSnapshots(edited, deleted)).toEqual(merged);
    expect(mergeSnapshots(merged, edited)).toEqual(merged);
  });

  it('keeps an attempt update newer than its deletion receipt', () => {
    const attempt = setAttempt({ updatedAt: 40 });
    const deletion = { table: 'questionSetAttempts', recordId: attempt.id, deletedAt: 30 };
    const merged = mergeSnapshots(
      backup({ tombstones: [deletion] }),
      backup({ questionSetAttempts: [attempt] }),
    );

    expect(merged.questionSetAttempts).toEqual([attempt]);
    expect(merged.tombstones).toContainEqual(deletion);
  });

  it('discards deleted attempts before checking conflicting submitted responses', () => {
    const submitted = (text: string, at: number) =>
      setAttempt({
        revisionId: `response-${text}`,
        updatedAt: at,
        responses: [
          {
            nodeId: 'set-question-1',
            draft: { kind: 'written', text },
            submitted: { kind: 'written', text },
            submittedAt: at,
          },
        ],
      });
    const deletion = { table: 'questionSetAttempts', recordId: 'set-attempt-1', deletedAt: 30 };
    const left = backup({ questionSetAttempts: [submitted('One', 21)], tombstones: [deletion] });
    const right = backup({ questionSetAttempts: [submitted('Two', 22)] });

    const merged = mergeSnapshots(left, right);

    expect(merged.questionSetAttempts).toEqual([]);
    expect(merged.tombstones).toContainEqual(deletion);
    expect(mergeSnapshots(right, left)).toEqual(merged);

    const restored = submitted('Two', 40);
    const restoredBackup = backup({ questionSetAttempts: [restored] });
    const resurrected = mergeSnapshots(left, restoredBackup);
    expect(resurrected.questionSetAttempts).toEqual([restored]);
    expect(resurrected.tombstones).toContainEqual(deletion);
    expect(mergeSnapshots(restoredBackup, left)).toEqual(resurrected);
  });

  it('keeps deleted submitted evidence out of repeated merges with a restored attempt', () => {
    const deletion = { table: 'questionSetAttempts', recordId: 'set-attempt-1', deletedAt: 30 };
    const restored = setAttempt({ revisionId: 'restored-answering', updatedAt: 40 });
    const stalePeer = backup({
      tombstones: [deletion],
      questionSetAttempts: [
        setAttempt({
          revisionId: 'deleted-submission',
          updatedAt: 22,
          responses: [
            {
              nodeId: 'set-question-1',
              draft: { kind: 'written', text: 'Old response' },
              submitted: { kind: 'written', text: 'Old response' },
              submittedAt: 22,
            },
          ],
        }),
      ],
    });
    const restoredBackup = backup({ questionSetAttempts: [restored] });
    const merged = mergeSnapshots(restoredBackup, stalePeer);
    const receiptFreePeer = { ...stalePeer, tombstones: [] };

    expect(merged.questionSetAttempts).toEqual([restored]);
    expect(mergeSnapshots(merged, receiptFreePeer).questionSetAttempts).toEqual([restored]);
    expect(mergeSnapshots(receiptFreePeer, merged).questionSetAttempts).toEqual([restored]);
    expect(mergeSnapshots(stalePeer, restoredBackup)).toEqual(merged);
  });

  it('retains Question Set attempt receipt media after authored content is deleted', () => {
    const hash = 'b'.repeat(64);
    const receipt = authoredSet(`Explain addition. ![diagram](lacuna-asset://${hash})`);
    const retained = setAttempt({ receipt });
    const merged = mergeSnapshots(
      backup({ questionSets: [receipt], questionSetAttempts: [retained], assets: [asset(hash)] }),
      backup({
        questionSets: [],
        questionSetAttempts: [retained],
        assets: [asset(hash)],
        tombstones: [{ table: 'questionSets', recordId: receipt.id, deletedAt: 50 }],
      }),
    );
    expect(merged.questionSets).toEqual([]);
    expect(merged.questionSetAttempts).toEqual([retained]);
    expect(merged.assets.map((row) => row.hash)).toEqual([hash]);
  });

  it('fails closed on conflicting Question Set attempt receipts or submitted originals', () => {
    const submitted = setAttempt({
      responses: [
        {
          nodeId: 'set-question-1',
          draft: { kind: 'written', text: 'One' },
          submitted: { kind: 'written', text: 'One' },
          submittedAt: 30,
        },
      ],
    });
    expect(() =>
      mergeSnapshots(
        backup({ questionSetAttempts: [submitted] }),
        backup({ questionSetAttempts: [setAttempt({ receipt: authoredSet('Different prompt') })] }),
      ),
    ).toThrow(/conflicting immutable receipts/i);
    expect(() =>
      mergeSnapshots(
        backup({ questionSetAttempts: [submitted] }),
        backup({
          questionSetAttempts: [
            setAttempt({
              revisionId: 'competing-response',
              responses: [
                {
                  nodeId: 'set-question-1',
                  draft: { kind: 'written', text: 'Two' },
                  submitted: { kind: 'written', text: 'Two' },
                  submittedAt: 30,
                },
              ],
            }),
          ],
        }),
      ),
    ).toThrow(/conflicting submitted responses/i);
  });

  it('does not let a later stale edit regress a completed Question Set attempt', () => {
    const completed = setAttempt({
      status: 'complete',
      responses: [
        {
          nodeId: 'set-question-1',
          draft: { kind: 'written', text: 'Answer' },
          submitted: { kind: 'written', text: 'Answer' },
          submittedAt: 30,
        },
      ],
      decisions: [{ allocationId: 'allocation-1', status: 'awarded', marks: 0 }],
      revealedQuestionIds: ['set-question-1'],
      paperSubmittedAt: 30,
      completedAt: 40,
      revisionId: 'completed',
      updatedAt: 40,
    });
    const stale = setAttempt({ revisionId: 'stale-later', updatedAt: 50 });
    const merged = mergeSnapshots(
      backup({ questionSetAttempts: [completed] }),
      backup({ questionSetAttempts: [stale] }),
    );
    expect(merged.questionSetAttempts[0]).toMatchObject({ status: 'complete', completedAt: 40 });
  });

  it('deterministically unions concurrent Practice submissions, reveals and assistance', () => {
    const first = authoredSet();
    const secondQuestion = structuredClone(first.questions[0]);
    secondQuestion.id = 'set-question-2';
    secondQuestion.answer!.allocations[0].id = 'allocation-2';
    const receipt = { ...first, questions: [first.questions[0], secondQuestion] };
    const baseResponses: QuestionSetAttemptRecord['responses'] = [
      { nodeId: 'set-question-1', draft: { kind: 'written', text: 'One' } },
      { nodeId: 'set-question-2', draft: { kind: 'written', text: 'Two' } },
    ];
    const left = setAttempt({
      receipt,
      mode: 'practice',
      revisionId: 'left',
      updatedAt: 31,
      responses: [
        { ...baseResponses[0], submitted: baseResponses[0].draft, submittedAt: 30 },
        baseResponses[1],
      ],
      revealedQuestionIds: ['set-question-1'],
      assistance: [{ nodeId: 'set-question-1', kind: 'related-knowledge', occurredAt: 25 }],
      reflection: { reasons: [], note: 'left state' },
    });
    const right = setAttempt({
      receipt,
      mode: 'practice',
      revisionId: 'right',
      updatedAt: 31,
      activeNodeId: 'set-question-2',
      responses: [
        baseResponses[0],
        { ...baseResponses[1], submitted: baseResponses[1].draft, submittedAt: 31 },
      ],
      revealedQuestionIds: ['set-question-2'],
      assistance: [{ nodeId: 'set-question-2', kind: 'answer-revealed', occurredAt: 26 }],
      reflection: { reasons: [], note: 'right state' },
    });
    const merged = mergeSnapshots(
      backup({ questionSetAttempts: [left] }),
      backup({ questionSetAttempts: [right] }),
    );
    const reversed = mergeSnapshots(
      backup({ questionSetAttempts: [right] }),
      backup({ questionSetAttempts: [left] }),
    );
    expect(merged.questionSetAttempts).toEqual(reversed.questionSetAttempts);
    expect(merged.questionSetAttempts[0]).toMatchObject({
      status: 'marking',
      activeNodeId: 'set-question-2',
      reflection: { note: 'right state' },
      revealedQuestionIds: ['set-question-1', 'set-question-2'],
      assistance: [
        { nodeId: 'set-question-1', kind: 'related-knowledge' },
        { nodeId: 'set-question-2', kind: 'answer-revealed' },
      ],
    });
    expect(mergeSnapshots(merged, merged)).toEqual(merged);
    expect(merged.questionSetAttempts[0].revisionId).toMatch(
      /^merged-attempt:fnv1a128-[a-f0-9]{32}$/,
    );
    expect(
      mergeSnapshots(merged, backup({ questionSetAttempts: [left] })).questionSetAttempts,
    ).toEqual(merged.questionSetAttempts);
    expect(
      mergeSnapshots(merged, backup({ questionSetAttempts: [right] })).questionSetAttempts,
    ).toEqual(merged.questionSetAttempts);
  });
});
