import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createLesson,
  createCourseCard,
  linkCardToLesson,
  stampMissingLessonViewModes,
  updateCourse,
  updateCourseAssessment,
} from './repository';
import { FSRS_VERSION } from '@lacuna/core/fsrs/params';
import { listLessons, listCardsForCourse } from './read';
import { resolveAssessmentCoverage } from '../course/assessmentCoverage';
import { reset } from './courseRepository.testFixtures';

describe('createCourse', () => {
  beforeEach(reset);

  it('applies all required defaults', async () => {
    const before = Date.now();
    const course = await createCourse('Biology');
    const after = Date.now();

    expect(course.name).toBe('Biology');
    expect(course.description).toBe('');
    expect(course.createdAt).toBeGreaterThanOrEqual(before);
    expect(course.createdAt).toBeLessThanOrEqual(after);
    expect(course.fsrsVersion).toBe(FSRS_VERSION);
    expect(course.fsrsParameters).toBeDefined();
    expect(course.examObjective).toBe('expectedMarks');
    expect(course.unlockMode).toBe('open');
    expect(course.autoPractice).toBe(true);
    expect(course.practiceThresholdMinutesFar).toBe(8);
    expect(course.practiceThresholdMinutesNear).toBe(4);
    expect(course.practiceUrgentWindowDays).toBe(7);
    expect(course.practiceMaxGap).toBe(2);
    // New courses default to edit mode (see src/course/lessonViewMode.ts).
    expect(course.lessonViewMode).toBe('edit');
    // examDate is 7 days ahead of createdAt at 23:59 local time.
    expect(course.examDate).toBeGreaterThan(course.createdAt);
    // id is generated.
    expect(typeof course.id).toBe('string');
    expect(course.id.length).toBeGreaterThan(0);
    // The compatibility date is derived from the separately persisted final assessment.
    const stored = await db.courses.get(course.id);
    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty('examDate');
    expect(stored).not.toHaveProperty('timeZone');
    const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(assessments).toHaveLength(1);
    expect(assessments[0]).toMatchObject({
      kind: 'final',
      examDate: course.examDate,
      timeZone: course.timeZone,
      afterLessonId: null,
      coverageMode: 'prefix',
      excludedCardIds: [],
    });
  });

  it('opts override defaults', async () => {
    const course = await createCourse('Physics', { unlockMode: 'linear', autoPractice: false });
    expect(course.unlockMode).toBe('linear');
    expect(course.autoPractice).toBe(false);
  });

  it('persists steady retention without an invented final date', async () => {
    const course = await createCourse('Spanish', { schedulingMode: 'steady' });
    const [finalAssessment] = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .toArray();
    const schedulingUnit = await db.schedulingUnits.get(course.id);

    expect(course.schedulingMode).toBe('steady');
    expect(course).not.toHaveProperty('examDate');
    expect(finalAssessment).toMatchObject({ kind: 'final', schedulingMode: 'steady' });
    expect(finalAssessment).not.toHaveProperty('examDate');
    expect(schedulingUnit).not.toHaveProperty('examDate');
  });

  it('can replace a dated final target with steady retention', async () => {
    const course = await createCourse('Spanish');
    const [finalAssessment] = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .toArray();

    await updateCourseAssessment(finalAssessment.id, {
      schedulingMode: 'steady',
      examDate: undefined,
      timeZone: undefined,
    });

    const updatedFinal = await db.courseAssessments.get(finalAssessment.id);
    expect(updatedFinal).toMatchObject({ schedulingMode: 'steady' });
    expect(updatedFinal).not.toHaveProperty('examDate');
    expect(updatedFinal).not.toHaveProperty('timeZone');
    expect(await db.schedulingUnits.get(course.id)).not.toHaveProperty('examDate');
  });

  it('seeds practice fields from the global practice defaults', async () => {
    const { writePracticeDefaults } = await import('../state/practiceDefaults');
    writePracticeDefaults({
      autoPractice: false,
      practiceThresholdMinutesFar: 90,
      practiceThresholdMinutesNear: 45,
      practiceUrgentWindowDays: 14,
      practiceMaxGap: 8,
    });

    const course = await createCourse('Chemistry');

    expect(course.autoPractice).toBe(false);
    expect(course.practiceThresholdMinutesFar).toBe(90);
    expect(course.practiceThresholdMinutesNear).toBe(45);
    expect(course.practiceUrgentWindowDays).toBe(14);
    expect(course.practiceMaxGap).toBe(8);

    localStorage.clear();
  });

  it('falls back to "Untitled course" for a blank name', async () => {
    const course = await createCourse('   ');
    expect(course.name).toBe('Untitled course');
  });

  it('keeps compatibility fields out of course writes and updates the final explicitly', async () => {
    const course = await createCourse('Biology');
    const movedDate = course.examDate! + 86_400_000;
    const final = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .filter((assessment) => assessment.kind === 'final')
      .first();

    await updateCourse(course.id, { name: 'Advanced Biology' });
    await updateCourseAssessment(final!.id, {
      examDate: movedDate,
      timeZone: 'Europe/Paris',
    });

    expect(await db.courses.get(course.id)).toMatchObject({ name: 'Advanced Biology' });
    expect(await db.courses.get(course.id)).not.toHaveProperty('examDate');
    expect(await db.courses.get(course.id)).not.toHaveProperty('timeZone');
    expect(await db.courseAssessments.get(final!.id)).toMatchObject({
      examDate: movedDate,
      timeZone: 'Europe/Paris',
    });
  });

  it('rejects compatibility date fields at the course repository boundary', async () => {
    const course = await createCourse('Biology');
    await expect(
      updateCourse(course.id, { examDate: course.examDate! + 1 } as Parameters<
        typeof updateCourse
      >[1]),
    ).rejects.toThrow('derived, read-only assessment values');
    expect(await db.courses.get(course.id)).not.toHaveProperty('examDate');
  });

  it('rejects a non-finite final date when creating a course', async () => {
    await expect(createCourse('Invalid', { examDate: Number.NaN })).rejects.toThrow(
      'finite timestamp',
    );
    expect(await db.courses.count()).toBe(0);
    expect(await db.courseAssessments.count()).toBe(0);
  });

  it('resolves the mandatory final assessment to cover every lesson and card', async () => {
    const course = await createCourse('Coverage regression');
    const first = await createLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');
    await linkCardToLesson(second.id, card.id);
    const [finalAssessment] = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .toArray();

    const [lessons, cards] = await Promise.all([
      listLessons(course.id),
      listCardsForCourse(course.id),
    ]);
    const links = await db.lessonCards.toArray();
    const resolved = resolveAssessmentCoverage(finalAssessment, lessons, cards, links);

    expect(resolved.coveredLessons.map((lesson) => lesson.id)).toEqual([first.id, second.id]);
    expect(resolved.cards.map((resolvedCard) => resolvedCard.id)).toEqual([card.id]);
    expect(resolved.validation.valid).toBe(true);
  });
});

describe('stampMissingLessonViewModes', () => {
  beforeEach(reset);

  it('stamps courses with no explicit mode using the retired global default', async () => {
    localStorage.setItem('lacuna.lessonViewMode', 'edit');
    const unstamped = await createCourse('Unstamped');
    await db.courses.update(unstamped.id, { lessonViewMode: undefined });

    await stampMissingLessonViewModes();

    const updated = await db.courses.get(unstamped.id);
    expect(updated?.lessonViewMode).toBe('edit');
  });

  it('leaves courses that already have an explicit mode untouched', async () => {
    localStorage.setItem('lacuna.lessonViewMode', 'edit');
    const alreadyStudy = await createCourse('Already study');
    await db.courses.update(alreadyStudy.id, { lessonViewMode: 'study' });

    await stampMissingLessonViewModes();

    const updated = await db.courses.get(alreadyStudy.id);
    expect(updated?.lessonViewMode).toBe('study');
  });
});
