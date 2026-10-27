import { Button } from '../ui/Button';
import { ArrowRightIcon } from '../ui/icons';
import { DueRing } from './DueRing';

/**
 * Study opens one recommendation with alternatives underneath. Today's queue opens
 * the same entry. The ring shows what is due today.
 */
export function CourseStudyActions({
  courseId,
  dueCount,
  doneToday,
  disabled = false,
  onStudy,
}: {
  courseId: string;
  dueCount: number;
  /** The course's cards already reviewed today, which fill the ring. */
  doneToday: number;
  disabled?: boolean;
  onStudy: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <DueRing due={dueCount} done={doneToday} />
      <Button
        data-study-trigger={courseId}
        hoverScale={false}
        pressScale={false}
        variant="primary"
        size="lg"
        disabled={disabled}
        onClick={onStudy}
      >
        Study
        <ArrowRightIcon />
      </Button>
    </div>
  );
}
