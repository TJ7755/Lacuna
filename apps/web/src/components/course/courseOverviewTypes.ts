import type { ReactNode } from 'react';
import type { PathNode, PracticePathNode } from '../../course/path';
import type { CourseAssessment, Lesson } from '@lacuna/core/db/types';
import type { AssessmentPracticeOption } from '../../course/assessmentPractice';
import type { LessonReorderInteraction } from './useLessonPathReorder';
import type { CourseAddKind } from './AddCourseControl';

export interface LessonNodeDetail {
  cardCount: number;
  dueCount: number;
  masteryPct: number;
}

export interface CourseOverviewProps {
  courseId: string;
  nodes: PathNode[];
  lessonCount: number;
  assessments: CourseAssessment[];
  timeZone?: string;
  authoring: boolean;
  localOrder?: boolean;
  learnerCheckpointIds?: readonly string[];
  archived: boolean;
  announcement: string;
  detailForLesson: (id: string) => LessonNodeDetail;
  lockHint: (id: string) => string | undefined;
  reorderFor: (id: string) => LessonReorderInteraction;
  onLessonMove: (id: string, delta: -1 | 1) => void;
  practiceProgress: Map<
    string,
    { fraction: number; completed: boolean; assessment?: AssessmentPracticeOption }
  >;
  onLessonOpen: (id: string) => void;
  onLessonCreated: (lesson: Lesson) => void;
  onPracticeOpen: (node: PracticePathNode) => void;
  onPracticeEdit: (node: PracticePathNode) => void;
  onAssessmentOpen: (id: string) => void;
  onAddTest?: () => void;
  onAdd: (kind: Exclude<CourseAddKind, 'lesson'>) => void;
  /** Rendered beneath the lessons, in the same column. */
  summary?: (cardClassName: string) => ReactNode;
}
