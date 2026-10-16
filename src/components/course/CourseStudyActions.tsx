import { Button } from '../ui/Button';
import { ArrowRightIcon } from '../ui/icons';
import { Menu, type MenuItem } from '../ui/Menu';
import { SimpleLearnPractice } from '../learn/SimpleLearnOptions';
import { DueRing } from './DueRing';

/**
 * A course's study entry, the same on every course page: Study opens the session plan
 * (the reversible default, showing what comes next before it starts) and Other ways
 * holds the alternatives. Today's queue opens the same plan. The ring before them shows
 * what is due today.
 */
export function CourseStudyActions({
  courseId,
  dueCount,
  doneToday,
  disabled = false,
  onStudy,
  otherWays,
}: {
  courseId: string;
  dueCount: number;
  /** The course's cards already reviewed today, which fill the ring. */
  doneToday: number;
  disabled?: boolean;
  onStudy: () => void;
  otherWays: MenuItem[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <DueRing due={dueCount} done={doneToday} />
      <Button
        data-study-trigger={courseId}
        hoverScale={false}
        variant="primary"
        size="lg"
        disabled={disabled}
        onClick={onStudy}
      >
        Study
        <ArrowRightIcon />
      </Button>
      <Menu
        label="Other ways to study"
        items={[
          ...otherWays,
          {
            label: 'Practise until all correct',
            panel: <SimpleLearnPractice courseId={courseId} />,
          },
        ]}
        chevron
        size="md"
      >
        Other ways
      </Menu>
    </div>
  );
}
