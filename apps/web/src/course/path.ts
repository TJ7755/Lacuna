// Pure course-path entry point; callers supply already-loaded data.
export { buildPath } from './pathConstruction';
export { isLessonUnlocked, lessonEffectiveReleaseDates } from './pathRules';
export {
  manualPracticeGateKeysAfterLesson,
  manualPracticeGateOutcomeAfterLesson,
  practiceGateAfterLesson,
} from './pathGates';
export { examIsUrgent, lessonStatus, nearestExamDate, pathPosition } from './pathProgress';
export type { PathNode, PracticePathNode, QuestionSetPathNode } from './pathTypes';
