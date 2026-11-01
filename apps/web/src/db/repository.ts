// Compatibility exports for high-level persistence operations.
// New callers should import the owning repository rather than touching Dexie tables directly.

export { createPracticeNode, savePracticeMilestoneProgress } from './practiceNodeRepository';
export {
  cardsForSequence,
  createSequence,
  updateSequence,
  deleteSequence,
  listSequences,
  snapshotSequence,
  restoreSequence,
} from './sequenceRepository';

export {
  createNote,
  updateNote,
  deleteNote,
  createNoteAnnotation,
  updateNoteAnnotation,
  deleteNoteAnnotation,
  listNoteAnnotations,
} from './noteRepository';

export {
  addTagToCards,
  assignCardsToLesson,
  buryCard,
  buryCards,
  checkDuplicate,
  checkDuplicatesBatch,
  createBasicReversedPair,
  createCard,
  createCards,
  createCardWithReverse,
  createCourseBasicReversedPair,
  createCourseCard,
  createCourseCardWithReverse,
  createLessonBasicReversedPair,
  createLessonCard,
  createLessonCardWithReverse,
  deleteCards,
  ensureCourseBankDeck,
  ensureLessonDeck,
  normaliseCardText,
  removeTagFromCards,
  rescheduleCards,
  restoreCards,
  setCardFlag,
  setCardsSuspended,
  snapshotCards,
  suspendCard,
  unsuspendCard,
  updateCard,
} from './cardRepository';
export type { CardSnapshot } from './cardRepository';

export * from './reviewRepository';

export * from './courseRepository';
export * from './lessonRepository';

export {
  createCourseAssessment,
  updateCourseAssessment,
  deleteCourseAssessment,
} from './assessmentRepository';
