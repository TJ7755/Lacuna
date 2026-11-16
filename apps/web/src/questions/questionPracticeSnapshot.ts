import type { Course, CourseAssessment, Lesson } from '@lacuna/core/db/types';
import type { Concept } from '@lacuna/core/questions/types';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { db } from '../db/schema';
import { makeEngine, decayOf } from '../fsrs/fsrs';
import { practiceContext } from './questionPracticeSelection';
import { deriveTechniqueSchedules } from './techniqueSchedule';
import { latestQuestionPracticeExposure } from './questionPracticeExposure';

interface LoadedPracticeCourse {
  course: Course | undefined;
  assessments: CourseAssessment[];
  lessons: Lesson[];
  concepts: Concept[];
}

/** Owned by one refresh or transaction; callers must load again after practice writes. */
export async function loadQuestionPracticeSnapshot(
  courseId: string,
  loaded?: LoadedPracticeCourse,
) {
  const [data, course, assessments, lessons] = await Promise.all([
    practiceContext(courseId, loaded?.concepts),
    loaded ? loaded.course : db.courses.get(courseId),
    loaded ? loaded.assessments : db.courseAssessments.where('courseId').equals(courseId).toArray(),
    loaded ? loaded.lessons : db.lessons.where('courseId').equals(courseId).toArray(),
  ]);
  const params = course?.fsrsParameters ?? defaultFsrsParameters();
  return {
    ...data,
    course,
    assessments,
    lessons,
    techniqueSchedules: deriveTechniqueSchedules(data.attempts),
    exposure: latestQuestionPracticeExposure(data.attempts),
    sim: { fsrs: makeEngine(params), decay: decayOf(params), expectedGrade: 3 as const },
  };
}

export type QuestionPracticeSnapshot = Awaited<ReturnType<typeof loadQuestionPracticeSnapshot>>;
