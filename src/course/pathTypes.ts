import type {
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCompletion,
  PracticeMilestone,
  PracticeNode,
  QuestionSetPracticeNode,
} from '../db/types';

/** The set of node types this build knows how to render. */
export const KNOWN_NODE_TYPES = [
  'lesson',
  'checkpoint',
  'practice-auto',
  'practice-manual',
  'practice-question-set',
] as const;

/** Display state of a lesson node on the path. */
export type LessonStatus = 'completed' | 'available' | 'locked';

/** A lesson rendered as a path node. */
export interface LessonPathNode {
  id: string;
  nodeType: 'lesson';
  lesson: Lesson;
  status: LessonStatus;
}

/**
 * A checkpoint assessment rendered as a path node.
 * Checkpoints are informational and never gate progression (addendum G).
 */
export interface CheckpointPathNode {
  id: string;
  nodeType: 'checkpoint';
  assessment: CourseAssessment;
  /**
   * ID of the lesson immediately before this checkpoint on the path, or null
   * when the checkpoint follows an empty lesson list.
   */
  afterLessonId: string | null;
}

/**
 * A practice session rendered as a path node (addendum 2 §H).
 *
 *  - `practice-manual`: a teacher-authored `PracticeNode` (type 'manual'), placed
 *    at its own stored `position`. `practiceNode` carries the authored record.
 *  - `practice-auto`: computed fresh on every `buildPath` call from the course's
 *    live due-card count and lessons-since-last-practice; never persisted.
 *    `practiceNode` is undefined — there is no authored configuration, it always
 *    covers the whole course's due cards.
 */
export interface PracticePathNode {
  id: string;
  nodeType: 'practice-auto' | 'practice-manual';
  /** The authored record for `practice-manual` nodes; undefined for `practice-auto`. */
  practiceNode?: PracticeNode;
  /**
   * ID of the lesson immediately before this node on the path, or null when it
   * precedes every lesson (mirrors CheckpointPathNode.afterLessonId).
   */
  afterLessonId: string | null;
  /** Stable persistence identity; auto keys do not depend on insertion sequence. */
  nodeKey: string;
  /** Last persisted milestone measurement, when one exists for this node. */
  milestone?: PracticeMilestone;
}

/** Optional authored Question Set activity, anchored to one exact Lesson. */
export interface QuestionSetPathNode {
  id: string;
  nodeType: 'practice-question-set';
  practiceNode: QuestionSetPracticeNode;
  questionSetIds: string[];
  afterLessonId: string;
  nodeKey: string;
}

/** A discriminated union of every path-node view model this build defines. */
export type PathNode = LessonPathNode | CheckpointPathNode | PracticePathNode | QuestionSetPathNode;

export interface PathProgress {
  exposures: LessonCardExposure[];
  lessonCompletions: LessonCompletion[];
  practiceMilestones: PracticeMilestone[];
}
