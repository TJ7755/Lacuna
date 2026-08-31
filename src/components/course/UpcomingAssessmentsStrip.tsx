// A compact row of upcoming assessments for CoursePath's header area, so exam/
// checkpoint dates are visible without opening CourseSettings or scrolling to
// find a checkpoint node on the path. Reuses the same `CourseAssessment` data
// CoursePath already loads for the path itself — no second query.
//
// British English throughout.

import type { CourseAssessment } from '../../db/types';
import { formatDate } from '../../utils/datetime';
import { FlagIcon } from '../ui/icons';

// Compact means "at a glance" — beyond this the row would read as a list, so
// the nearest few take priority and the rest scroll rather than wrap into a
// second row (mirroring nearestExam/nearestPracticeAssessmentDate elsewhere,
// which only ever surface the single nearest date).
const MAX_VISIBLE = 4;

interface UpcomingAssessmentsStripProps {
  assessments: CourseAssessment[];
  now: number;
  onSelect: (assessmentId: string) => void;
  className?: string;
}

/**
 * Upcoming (future-dated) assessments, nearest first, as clickable pills.
 * Renders nothing when there are none — matching the empty-case convention
 * used elsewhere in CoursePath's header (e.g. the "Review updates" pill).
 */
export function UpcomingAssessmentsStrip({
  assessments,
  now,
  onSelect,
  className,
}: UpcomingAssessmentsStripProps) {
  // Future-only, nearest first — the same comparison assessmentPracticeOptions
  // and nearestExamDate use elsewhere for "is this assessment still ahead of us".
  const upcoming = assessments
    .filter(
      (assessment): assessment is CourseAssessment & { examDate: number } =>
        assessment.examDate !== undefined && assessment.examDate > now,
    )
    .sort((left, right) => left.examDate - right.examDate);

  if (upcoming.length === 0) return null;

  const rowClassName = ['flex min-w-0 items-center gap-2 overflow-x-auto', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClassName} aria-label="Upcoming assessments">
      {upcoming.slice(0, MAX_VISIBLE).map((assessment) => (
        <button
          key={assessment.id}
          type="button"
          onClick={() => onSelect(assessment.id)}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <FlagIcon width={14} height={14} className="shrink-0 text-ink-faint" />
          <span className="font-medium text-ink">{assessment.name}</span>
          <span className="text-ink-faint">
            {formatDate(assessment.examDate, assessment.timeZone)}
          </span>
        </button>
      ))}
    </div>
  );
}
