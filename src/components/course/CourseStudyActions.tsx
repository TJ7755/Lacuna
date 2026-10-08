import { Button } from '../ui/Button';
import { ArrowRightIcon } from '../ui/icons';
import { Menu, type MenuItem } from '../ui/Menu';

/**
 * A course's study entry, the same on every course page: Study opens the session plan
 * (the reversible default, showing what comes next before it starts) and Other ways
 * holds the alternatives. Today's queue opens the same plan.
 */
export function CourseStudyActions({
  dueCount,
  disabled = false,
  onStudy,
  otherWays,
}: {
  dueCount: number;
  disabled?: boolean;
  onStudy: () => void;
  otherWays: MenuItem[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button variant="primary" size="lg" disabled={disabled} onClick={onStudy}>
        Study{dueCount > 0 ? ` ${dueCount}` : ''}
        <ArrowRightIcon />
      </Button>
      <Menu label="Other ways to study" items={otherWays} chevron size="md">
        Other ways
      </Menu>
    </div>
  );
}
