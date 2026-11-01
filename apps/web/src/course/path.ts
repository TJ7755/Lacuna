// Pure course-path entry point; callers supply already-loaded data.
export { buildPath } from './pathConstruction';
export { isLessonUnlocked, lessonEffectiveReleaseDates } from './pathRules';
export {
  manualPracticeGateKeysAfterLesson,
  manualPracticeGateOutcomeAfterLesson,
  practiceGateAfterLesson,
} from './pathGates';
export {
  EXAM_URGENT_DAYS,
  examIsUrgent,
  lessonStatus,
  nearestExamDate,
  pathPosition,
} from './pathProgress';
export { KNOWN_NODE_TYPES } from './pathTypes';
export type {
  LessonStatus,
  PathNode,
  PathProgress,
  PracticePathNode,
  QuestionSetPathNode,
} from './pathTypes';
