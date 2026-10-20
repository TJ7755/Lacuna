import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import familyExample from '../../docs/question-bank/examples/numeric-family.json';
import { db } from '../db/schema';
import { createCourse } from '../db/repository';
import { exportDatabase, importBackup } from '../db/portability';
import { buildCourseFile, decodeCourseFile, withCourseFileAssets } from '../db/courseFile';
import { importSharePayload } from '../db/share';
import { mergeQuestionSetAttemptPair } from './questionSetAttemptMerge';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { decodeSnapshot, encodeSnapshot } from '../sync/snapshot';
import { exportQuestionBank, importQuestionBank } from './bank';
import {
  deriveConceptApplicationSchedules,
  startConceptPractice,
  undoConceptPracticeAttempt,
} from './conceptPractice';
import {
  completeQuestionSetAttempt,
  saveQuestionSetMarking,
  submitPracticeQuestion,
} from './questionSetAttemptRepository';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('round-trips lazy families and immutable Concept evidence through backups, recovery and sync', async () => {
  const course = await createCourse('Physics');
  await importQuestionBank(familyExample, course.id);
  let { attempt } = await startConceptPractice(course.id);
  attempt = await submitPracticeQuestion(
    attempt.id,
    attempt.revisionId,
    attempt.receipt.questions[0].id,
  );
  attempt = await saveQuestionSetMarking(attempt.id, attempt.revisionId, {
    decisions: [
      {
        allocationId: attempt.receipt.questions[0].answer!.allocations[0].id,
        status: 'awarded',
        marks: 1,
      },
    ],
    annotations: [],
    corrections: [],
    reflection: { reasons: [], note: '' },
    activeNodeId: attempt.activeNodeId,
    activeAllocationId: null,
  });
  attempt = await completeQuestionSetAttempt(attempt.id, attempt.revisionId);
  const schedule = deriveConceptApplicationSchedules([attempt]);
  expect(schedule.size).toBe(1);
  const original = await exportDatabase();
  const encoded = await encodeSnapshot(original);
  const decoded = await decodeSnapshot(encoded.payload);
  await importBackup(decoded, 'replace');
  expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  expect(await exportQuestionBank(course.id, familyExample.bankId)).toEqual(familyExample);
  expect(deriveConceptApplicationSchedules(await db.questionSetAttempts.toArray())).toEqual(
    schedule,
  );
  const competing = structuredClone(attempt);
  competing.revisionId = 'competing-first-mark';
  competing.firstMarking![0].decisions[0] = {
    ...competing.firstMarking![0].decisions[0],
    status: 'awarded',
    marks: 0,
  };
  const conflict = mergeQuestionSetAttemptPair(attempt, competing);
  await db.questionSetAttempts.put(conflict);
  await importBackup(await exportDatabase(), 'replace');
  expect((await db.questionSetAttempts.get(attempt.id))?.firstMarkingConflicts).toEqual(
    conflict.firstMarkingConflicts,
  );
  expect(conflict.firstMarkingConflicts).toHaveLength(2);
  expect(deriveConceptApplicationSchedules([conflict]).size).toBe(0);
  await db.questionSetAttempts.put(attempt);
  const undone = await undoConceptPracticeAttempt(attempt.id, attempt.revisionId);
  const latest = await exportDatabase();
  const merged = mergeSnapshots(original, latest);
  expect(merged.questionSetAttempts).toEqual(mergeSnapshots(latest, original).questionSetAttempts);
  expect(merged.questionSetAttempts![0].firstMarking).toEqual(attempt.firstMarking);
  expect(merged.questionSetAttempts![0].undoneAt).toBe(undone.undoneAt);
  expect(deriveConceptApplicationSchedules(merged.questionSetAttempts!).size).toBe(0);
});

it('course files remap local Concepts inside both family source and representative content', async () => {
  const course = await createCourse('Physics');
  await importQuestionBank(familyExample, course.id);
  await startConceptPractice(course.id);
  const file = await decodeCourseFile(await buildCourseFile(course.id));
  expect(JSON.stringify(file.payload)).not.toContain('firstMarking');
  await db.delete();
  await db.open();
  await withCourseFileAssets(file, () => importSharePayload(file.payload));
  const imported = (await db.courses.toArray())[0];
  const exported = await exportQuestionBank(imported.id, familyExample.bankId);
  expect(exported).toMatchObject({
    bankId: familyExample.bankId,
    courseCode: familyExample.courseCode,
    concepts: familyExample.concepts,
  });
  expect(exported.families[0].parameters).toEqual(familyExample.families[0].parameters);
  expect(exported.families[0].template.questions[0].prompt).toBe(
    familyExample.families[0].template.questions[0].prompt,
  );
  const started = await startConceptPractice(imported.id);
  const ids = new Set((await db.concepts.toArray()).map((concept) => concept.id));
  expect(ids.has(started.selection.conceptId)).toBe(true);
  expect(
    ids.has(started.attempt.receipt.questions[0].answer!.allocations[0].targetConceptIds[0]),
  ).toBe(true);
  expect(await db.questionSetAttempts.count()).toBe(1);
});
