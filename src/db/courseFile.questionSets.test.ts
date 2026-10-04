import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse, createLesson } from './repository';
import { createConcept, createFixedQuestion, startQuestionAttempt } from '../questions/repository';
import { createQuestionSet } from '../questions/questionSetRepository';
import { assetUrl, storeImageBlob } from './assets';
import { buildCourseFile, decodeCourseFile, withCourseFileAssets } from './courseFile';
import { importSharePayload } from './share';

async function clearDatabase(): Promise<void> {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
}

describe('course files with authored Question Sets', () => {
  beforeEach(clearDatabase);

  it('round-trips nested set content, links and set-only media without personal attempts', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const assessment = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
    const concept = await createConcept(course.id, 'Cell structure');
    const image = await storeImageBlob(
      new Blob(['question diagram'], { type: 'image/png' }),
      'image/png',
      640,
      480,
    );

    const legacyQuestion = await createFixedQuestion({
      courseId: course.id,
      name: 'Legacy question',
      prompt: 'Describe the cell.',
      explanation: 'A cell is the basic unit of life.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
      targetConceptId: concept.id,
    });
    await startQuestionAttempt({ questionId: legacyQuestion.id, sessionId: 'session-1', now: 10 });

    const sourceSet = await createQuestionSet(
      {
        id: 'set-source',
        courseId: course.id,
        title: 'Cell paper',
        lessonIds: [lesson.id],
        assessmentIds: [assessment.id],
        questions: [
          {
            id: 'question-source',
            prompt: `Use the diagram: ![Cell](${assetUrl(image.hash)})`,
            parts: [
              {
                id: 'part-source',
                prompt: 'Explain the evidence.',
                subparts: [
                  {
                    id: 'subpart-source',
                    prompt: 'Name the structure.',
                    answer: {
                      maxMarks: 1,
                      response: { kind: 'written' },
                      prerequisiteConceptIds: [],
                      allocations: [
                        {
                          id: 'allocation-source',
                          criterion: 'Names the structure.',
                          explanation: `Refer to ![Cell](${assetUrl(image.hash)})`,
                          maxMarks: 1,
                          dimension: 'knowledge',
                          targetConceptIds: [concept.id],
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      100,
    );

    const file = await decodeCourseFile(await buildCourseFile(course.id));
    if (file.payload.v !== 4) throw new Error('Expected a v4 course payload.');
    expect(file.payload.questionSets).toHaveLength(1);
    expect(file.assets.map((asset) => asset.hash)).toEqual([image.hash]);

    await clearDatabase();
    await withCourseFileAssets(file, () => importSharePayload(file.payload));

    const importedCourse = (await db.courses.toArray())[0];
    const importedLesson = (
      await db.lessons.where('courseId').equals(importedCourse.id).toArray()
    )[0];
    const importedAssessment = (
      await db.courseAssessments.where('courseId').equals(importedCourse.id).toArray()
    )[0];
    const importedConcept = (
      await db.concepts.where('courseId').equals(importedCourse.id).toArray()
    )[0];
    const importedSet = (
      await db.questionSets.where('courseId').equals(importedCourse.id).toArray()
    )[0];

    expect(importedSet.id).not.toBe(sourceSet.id);
    expect(importedSet.lessonIds).toEqual([importedLesson.id]);
    expect(importedSet.assessmentIds).toEqual([importedAssessment.id]);
    expect(importedSet.questions[0].id).not.toBe(sourceSet.questions[0].id);
    expect(
      importedSet.questions[0].parts[0].subparts[0].answer!.allocations[0].targetConceptIds,
    ).toEqual([importedConcept.id]);
    expect(importedSet.questions[0].prompt).toContain(assetUrl(image.hash));
    expect(
      importedSet.questions[0].parts[0].subparts[0].answer!.allocations[0].explanation,
    ).toContain(assetUrl(image.hash));
    expect(await db.assets.get(image.hash)).toBeDefined();
    expect(await db.questionAttempts.count()).toBe(0);
  });
});
