import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createCourseAssessment,
  createCourseCard,
  createLesson,
  createLessonCard,
  createLessonCardWithReverse,
  createNote,
  linkCardToLesson,
} from './repository';
import {
  buildCourseShareCode,
  decodeShare,
  encodeShareDirect,
  importSharePayload,
  summariseShare,
} from './share';
import {
  createConcept,
  createFixedQuestion,
  createGeneratedQuestion,
} from '../questions/repository';
import { reset, v2Payload } from './share.testFixtures';

describe('ordinary course share imports', () => {
  beforeEach(reset);

  it('unpacks a legacy k:3 (typing) card as front_back for backward compatibility', async () => {
    const payload = v2Payload([{ k: 3, f: 'What is the capital of Japan?', b: 'Tokyo' }]);
    await importSharePayload(payload);
    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe('front_back');
    expect(cards[0].front).toBe('What is the capital of Japan?');
    expect(cards[0].back).toBe('Tokyo');
  });

  it('round-trips a steady-retention target without inventing a date', async () => {
    const course = await createCourse('Spanish', { schedulingMode: 'steady' });
    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.course.sm).toBe(1);
    expect(payload.course.e).toBeUndefined();
    expect(payload.exams?.find((assessment) => assessment.k === 'f')).toMatchObject({ sm: 1 });

    await reset();
    const result = await importSharePayload(payload);
    const [importedFinal] = await db.courseAssessments
      .where('courseId')
      .equals(result.courseIds[0])
      .toArray();
    expect(importedFinal).toMatchObject({ kind: 'final', schedulingMode: 'steady' });
    expect(importedFinal).not.toHaveProperty('examDate');
    expect(await db.schedulingUnits.get(result.courseIds[0])).not.toHaveProperty('examDate');
  });

  it('rejects a received course with more than one final assessment', async () => {
    const course = await createCourse('Spanish', { schedulingMode: 'steady' });
    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');
    const final = payload.exams!.find((assessment) => assessment.k === 'f')!;
    payload.exams!.push({ ...final, id: `${final.id}-duplicate` });

    await reset();
    await expect(importSharePayload(payload)).rejects.toThrow(
      'A shared course must contain exactly one final assessment.',
    );
    expect(await db.courses.count()).toBe(0);
  });

  it('round-trips a course with lessons, notes, mixed card types and an exam date', async () => {
    const course = await createCourse('Biology', {
      unlockMode: 'semi-linear',
      learnFirst: false,
    });
    const lessonA = await createLesson(course.id, 'Cells');
    const lessonB = await createLesson(course.id, 'Genetics');

    await createNote(lessonA.id, 'Overview', 'Cells are the basic unit of life.');
    await createLessonCard(course.id, lessonA.id, 'front_back', 'Front', 'Back');
    await createLessonCard(
      course.id,
      lessonA.id,
      'cloze',
      'The {{c1::mitochondria}} is the powerhouse.',
      '',
    );
    await createLessonCard(course.id, lessonA.id, 'front_back', 'Name the organelle', 'Nucleus');

    await createNote(lessonB.id, 'Notes', 'DNA carries genetic information.');
    await createLessonCard(course.id, lessonB.id, 'front_back', 'chien', 'dog');
    // Mirrored cards stay distinct in course shares so assessment exclusions can target either id.
    await createLessonCard(course.id, lessonB.id, 'front_back', 'dog', 'chien');

    await createCourseAssessment(course.id, 'Mid-term', 2_000_000_000_000, {
      afterLessonId: lessonA.id,
      coverageMode: 'custom',
      lessonIds: [lessonA.id],
    });

    const code = await buildCourseShareCode(course.id);
    const payload = await decodeShare(code);
    expect(payload.v).toBe(6);
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.course.n).toBe('Biology');
    expect(payload.course.um).toBe('semi-linear');
    expect(payload.course.lf).toBe(0);
    expect(payload.lessons).toHaveLength(2);
    expect(payload.lessons.map((l) => l.n)).toEqual(['Cells', 'Genetics']);
    expect(payload.lessons[0].notes).toHaveLength(1);
    expect(payload.lessons[0].notes[0].c).toBe('Cells are the basic unit of life.');
    expect(payload.lessons[1].cards).toHaveLength(2);
    expect(payload.exams).toHaveLength(2);
    expect(payload.exams!.find((assessment) => assessment.k === 'c')?.ls).toEqual([0]);

    const summary = summariseShare(payload);
    expect(summary.kind).toBe('course');
    expect(summary.courseName).toBe('Biology');
    expect(summary.lessonCount).toBe(2);
    expect(summary.noteCount).toBe(2);
    expect(summary.cardCount).toBe(5); // front_back + cloze + front_back + reversible pair (2)

    const result = await importSharePayload(payload);
    expect(result.courses).toBe(1);
    expect(result.lessons).toBe(2);
    expect(result.cards).toBe(5);

    const importedCourses = await db.courses.toArray();
    const imported = importedCourses.find((c) => c.id !== course.id)!;
    expect(result.courseIds).toEqual([imported.id]);
    expect(imported.name).toBe('Biology');
    expect(imported.unlockMode).toBe('semi-linear');
    expect(imported.learnFirst).toBe(false);
    // Imported courses default to study (read-only) mode, regardless of the
    // sharer's own lessonViewMode — the share payload never packs it.
    expect(imported.lessonViewMode).toBe('study');

    const importedLessons = await db.lessons
      .where('courseId')
      .equals(imported.id)
      .sortBy('orderIndex');
    expect(importedLessons.map((l) => l.name)).toEqual(['Cells', 'Genetics']);

    const notesA = await db.notes.where('lessonId').equals(importedLessons[0].id).toArray();
    expect(notesA).toHaveLength(1);
    expect(notesA[0].content).toBe('Cells are the basic unit of life.');

    const cardsA = await db.cards.where('primaryLessonId').equals(importedLessons[0].id).toArray();
    expect(cardsA).toHaveLength(3);
    expect(
      cardsA.some(
        (c) => c.type === 'front_back' && c.front === 'Name the organelle' && c.back === 'Nucleus',
      ),
    ).toBe(true);

    const cardsB = await db.cards.where('primaryLessonId').equals(importedLessons[1].id).toArray();
    expect(cardsB).toHaveLength(2);
    expect(cardsB.some((c) => c.front === 'chien' && c.back === 'dog')).toBe(true);
    expect(cardsB.some((c) => c.front === 'dog' && c.back === 'chien')).toBe(true);

    const importedAssessments = await db.courseAssessments
      .where('courseId')
      .equals(imported.id)
      .toArray();
    expect(importedAssessments).toHaveLength(2);
    const importedCheckpoint = importedAssessments.find(
      (assessment) => assessment.kind === 'checkpoint',
    );
    expect(importedCheckpoint?.name).toBe('Mid-term');
    expect(importedCheckpoint?.coverageMode).toBe('custom');
    if (importedCheckpoint?.coverageMode !== 'custom') {
      throw new Error('expected custom coverage');
    }
    expect(importedCheckpoint.lessonIds).toEqual([importedLessons[0].id]);
  });

  it('preserves full assessment semantics and ids through an empty-database round-trip', async () => {
    const course = await createCourse('Chemistry');
    const lessonA = await createLesson(course.id, 'Atoms');
    const lessonB = await createLesson(course.id, 'Bonding');
    const card = await createLessonCard(course.id, lessonA.id, 'front_back', 'Proton', 'Positive');
    const checkpoint = await createCourseAssessment(course.id, 'Paper 1', 2_000_000_000_000, {
      afterLessonId: lessonB.id,
      coverageMode: 'custom',
      lessonIds: [lessonA.id],
      excludedCardIds: [card.id],
      needsAuthorConfirmation: true,
    });
    const originalFinal = (
      await db.courseAssessments.where('courseId').equals(course.id).toArray()
    ).find((assessment) => assessment.kind === 'final')!;
    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    await reset();
    await importSharePayload(payload);

    const assessments = await db.courseAssessments.toArray();
    const importedCheckpoint = assessments.find((assessment) => assessment.kind === 'checkpoint')!;
    const importedFinal = assessments.find((assessment) => assessment.kind === 'final')!;
    const importedLessons = await db.lessons.orderBy('orderIndex').toArray();
    const importedCard = (await db.cards.toArray()).find((entry) => entry.front === 'Proton')!;
    expect(importedFinal.id).toBe(originalFinal.id);
    expect(importedCheckpoint).toEqual(
      expect.objectContaining({
        id: checkpoint.id,
        afterLessonId: importedLessons[1].id,
        coverageMode: 'custom',
        lessonIds: [importedLessons[0].id],
        excludedCardIds: [importedCard.id],
        needsAuthorConfirmation: true,
      }),
    );
  });

  it('preserves linked bank-card assessment membership and exclusions', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Atoms');
    const bankCard = await createCourseCard(course.id, 'front_back', 'Neutron', 'Neutral');
    await linkCardToLesson(lesson.id, bankCard.id);
    await createCourseAssessment(course.id, 'Paper 1', 2_000_000_000_000, {
      afterLessonId: lesson.id,
      coverageMode: 'prefix',
      excludedCardIds: [bankCard.id],
    });
    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    await reset();
    await importSharePayload(payload);

    const importedLesson = (await db.lessons.toArray())[0];
    const importedCard = (await db.cards.toArray()).find((card) => card.front === 'Neutron')!;
    const importedCheckpoint = (await db.courseAssessments.toArray()).find(
      (assessment) => assessment.kind === 'checkpoint',
    )!;
    expect(importedCard.primaryLessonId).toBeNull();
    expect(await db.lessonCards.where('lessonId').equals(importedLesson.id).first()).toEqual(
      expect.objectContaining({ cardId: importedCard.id }),
    );
    expect(importedCheckpoint.excludedCardIds).toEqual([importedCard.id]);
  });

  it('round-trips v3 Concepts, alternate Card presentations and Question definitions without learner state', async () => {
    const course = await createCourse('Algebra applications');
    const lesson = await createLesson(course.id, 'Equations');
    const target = await createConcept(course.id, 'Solve equations');
    const prerequisite = await createConcept(course.id, 'Collect terms');
    const pair = await createLessonCardWithReverse(
      course.id,
      lesson.id,
      'Equation',
      'Unknown value',
    );
    await db.cards.update(pair.card.id, { conceptId: target.id });
    await db.cards.update(pair.reverse.id, { conceptId: target.id });
    await createFixedQuestion({
      courseId: course.id,
      primaryLessonId: lesson.id,
      name: 'Linear equation',
      prompt: 'Solve $2x = 8$.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
      explanation: 'Divide both sides by 2.',
      targetConceptId: target.id,
      prerequisiteConceptIds: [prerequisite.id],
    });
    await createGeneratedQuestion({
      courseId: course.id,
      name: 'Quadratic family',
      generatorKey: 'integer-root-quadratic',
      generatorVersion: 1,
      generatorConfig: {
        minimumRootMagnitude: 1,
        maximumRootMagnitude: 2,
        maximumLeadingCoefficient: 1,
        allowRepeatedRoots: false,
      },
      targetConceptId: target.id,
    });
    await db.questionSets.add({
      id: 'set-origin',
      courseId: course.id,
      title: 'Equation paper',
      lessonIds: [lesson.id],
      assessmentIds: [],
      questions: [
        {
          id: 'set-question-origin',
          prompt: 'Solve the equation.',
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [prerequisite.id],
            allocations: [
              {
                id: 'allocation-origin',
                criterion: 'Solves correctly',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [target.id],
              },
            ],
          },
          parts: [],
        },
      ],
      contentVersion: 1,
      contentRevisionId: 'set-revision-origin',
      createdAt: 1,
      updatedAt: 1,
    });

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    expect(payload.v).toBe(6);
    if (payload.v !== 6) throw new Error('expected a v6 course payload');
    expect(payload.questions).toHaveLength(2);
    expect(payload.questionSets).toHaveLength(1);
    expect(payload.concepts.map((concept) => concept.id)).toEqual(
      expect.arrayContaining([target.id, prerequisite.id]),
    );
    expect(new Set(payload.lessons[0].cards.map((card) => card.co)).size).toBe(1);
    expect(JSON.stringify(payload)).not.toContain('scheduleEpoch');
    expect(JSON.stringify(payload)).not.toContain('questionAttempts');

    await reset();
    const result = await importSharePayload(payload);
    expect(result.questions).toBe(2);
    expect(await db.questionAttempts.count()).toBe(0);
    const importedQuestions = await db.questions.toArray();
    expect(importedQuestions).toHaveLength(2);
    expect(importedQuestions.every((question) => question.reps === 0)).toBe(true);
    const importedSet = await db.questionConcepts.get(
      importedQuestions.find((question) => question.kind === 'fixed')!.id,
    );
    expect(importedSet?.targetConceptIds).toHaveLength(1);
    expect(importedSet?.prerequisiteConceptIds).toHaveLength(1);
    const importedCards = await db.cards.toArray();
    expect(new Set(importedCards.map((card) => card.conceptId)).size).toBe(1);
    const [importedQuestionSet] = await db.questionSets.toArray();
    expect(importedQuestionSet.id).not.toBe('set-origin');
    expect(importedQuestionSet.lessonIds).toEqual([expect.any(String)]);
    expect(importedQuestionSet.lessonIds[0]).not.toBe(lesson.id);
    expect(importedQuestionSet.questions[0].answer?.allocations[0].targetConceptIds).toEqual([
      importedSet!.targetConceptIds[0],
    ]);
  });

  it('preserves an unknown generated family safely as suspended content', async () => {
    const course = await createCourse('Future generators');
    const target = await createConcept(course.id, 'Future skill');
    await createGeneratedQuestion({
      courseId: course.id,
      name: 'Known family',
      generatorKey: 'integer-root-quadratic',
      generatorVersion: 1,
      generatorConfig: {
        minimumRootMagnitude: 1,
        maximumRootMagnitude: 1,
        maximumLeadingCoefficient: 1,
        allowRepeatedRoots: false,
      },
      targetConceptId: target.id,
    });
    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v !== 6) throw new Error('expected a v6 course payload');
    const generated = payload.questions.find((question) => question.k === 1)!;
    generated.gk = 'future-family';
    generated.gv = 99;

    await reset();
    await importSharePayload(await decodeShare(await encodeShareDirect(payload)));
    expect(await db.questions.toCollection().first()).toMatchObject({
      kind: 'generated',
      generatorKey: 'future-family',
      generatorVersion: 99,
      suspended: true,
    });
  });
});
