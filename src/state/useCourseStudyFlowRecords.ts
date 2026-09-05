import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { hydrateCardsWithHistory } from '../db/reviewHistoryRead';
import { performanceForCourseBackingDecks } from '../db/backingDecks';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import type {
  Course,
  Lesson,
  Card,
  CourseAssessment,
  LessonCardLink,
  LessonCardExposure,
  LessonCompletion,
  PracticeNode,
  PracticeMilestone,
  UserPerformance,
} from '../db/types';

interface CourseStudyFlowRecords {
  course: Course | null;
  lessons: Lesson[];
  cards: Card[];
  assessments: CourseAssessment[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  completions: LessonCompletion[];
  practiceNodes: PracticeNode[];
  milestones: PracticeMilestone[];
  performance: UserPerformance[];
}

/** Shared course reads for the path preview and the active study conductor. */
export function useCourseStudyFlowRecords(courseId: string | undefined, refreshKey = 0) {
  return useLiveQuery<CourseStudyFlowRecords>(async () => {
    if (!courseId) {
      return {
        course: null,
        lessons: [],
        cards: [],
        assessments: [],
        links: [],
        exposures: [],
        completions: [],
        practiceNodes: [],
        milestones: [],
        performance: [],
      };
    }
    const [courseRecord, assessments] = await Promise.all([
      db.courses.get(courseId),
      db.courseAssessments.where('courseId').equals(courseId).toArray(),
    ]);
    if (!courseRecord) {
      return {
        course: null,
        lessons: [],
        cards: [],
        assessments: [],
        links: [],
        exposures: [],
        completions: [],
        practiceNodes: [],
        milestones: [],
        performance: [],
      };
    }
    const course = hydrateCourse(courseRecord, finalAssessmentForCourse(courseId, assessments));
    const [lessons, rawCards, practiceNodes, milestones] = await Promise.all([
      db.lessons.where('courseId').equals(courseId).sortBy('orderIndex'),
      db.cards.where('courseId').equals(courseId).toArray(),
      db.practiceNodes.where('courseId').equals(courseId).toArray(),
      db.practiceMilestones.where('courseId').equals(courseId).toArray(),
    ]);
    const cards = await hydrateCardsWithHistory(rawCards);
    const lessonIds = lessons.map((lesson) => lesson.id);
    const [links, exposures, completions, performance] = await Promise.all([
      lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0
        ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray()
        : [],
      lessonIds.length > 0 ? db.lessonCompletions.where('lessonId').anyOf(lessonIds).toArray() : [],
      performanceForCourseBackingDecks(courseId, cards),
    ]);
    return {
      course,
      lessons,
      cards,
      assessments,
      links,
      exposures,
      completions,
      practiceNodes,
      milestones,
      performance,
    };
  }, [courseId, refreshKey]);
}
