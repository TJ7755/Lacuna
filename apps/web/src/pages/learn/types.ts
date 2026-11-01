import type {
  CheckerDisputeReport,
  Course,
  LineVerdict,
  Note,
  SchedulingUnitRecord,
} from '@lacuna/core/db/types';

export type Phase = 'loading' | 'notes' | 'question' | 'answer' | 'finished';
export type { SessionCardOutcome } from '../../course/sessionSummary';

/** Automatic marking of a submitted typed answer: still judging, or the verdict it reached. */
export type AutoMark = { pending: true } | { pending: false; correct: boolean };

/** A machine-verified response passed into the existing review pipeline. */
export interface MachineMarkedAnswer {
  correct: boolean;
  marksEarned: number;
  marksAvailable: number;
  lineVerdicts?: LineVerdict[];
  checkerDisputes?: CheckerDisputeReport[];
}

export type { LearnModeType, LearnSessionRequest } from '../../course/learnSessionRequest';

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
