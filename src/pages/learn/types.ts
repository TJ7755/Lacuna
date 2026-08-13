import type {
  CheckerDisputeReport,
  Course,
  LineVerdict,
  Note,
  SchedulingUnitRecord,
} from '../../db/types';

export type Phase = 'loading' | 'notes' | 'question' | 'answer' | 'finished';
export type SessionCardOutcome = 'correct' | 'wrong';

/** A machine-verified response passed into the existing review pipeline. */
export interface MachineMarkedAnswer {
  correct: boolean;
  marksEarned: number;
  marksAvailable: number;
  lineVerdicts?: LineVerdict[];
  checkerDisputes?: CheckerDisputeReport[];
}

/** The distinct visual identity of the current learn session. */
export type LearnModeType =
  | 'fsrs'
  | 'simple'
  | 'cram'
  | 'filtered'
  | 'filtered-due'
  | 'filtered-new'
  | 'filtered-leech'
  | 'filtered-flagged'
  | 'filtered-suspended';

export const FILTER_LABELS: Record<string, string> = {
  due: 'due cards',
  new: 'new cards',
  leech: 'leeches',
  flagged: 'flagged cards',
  suspended: 'suspended cards',
};

/**
 * The scheduling unit a session studies: an explicit scheduling unit, or a Course (both the
 * course-wide practice scope and the lesson scope, which schedules against its
 * parent Course — see SessionUnitScope in fsrs/session.ts). Both shapes carry
 * the fields this component reads directly (name, dailyReviewGoal, etc).
 */
export type StudyUnit = SchedulingUnitRecord | Course;

/** The lesson notes shown before cards begin on a first-ever study of a lesson. */
export interface LessonNotesScreen {
  lessonName: string;
  notes: Note[];
}

export type LearnSessionRequest =
  | { kind: 'lesson'; lessonId: string }
  | {
      kind: 'practice';
      courseId: string;
      nodeKey?: string;
      /** Current curricular session scope; omitted for recurring and ad-hoc review. */
      scopeLessonIds?: string[];
      mode: 'curricular' | 'recurring' | 'ad-hoc';
      assessmentId?: never;
    }
  | {
      kind: 'practice';
      courseId: string;
      mode: 'assessment';
      assessmentId: string;
      planId?: string;
      windowId?: string;
    };
