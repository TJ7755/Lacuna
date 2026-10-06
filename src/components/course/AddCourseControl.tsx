import { m as motion } from 'motion/react';
import { CardsIcon, FlagIcon, FileTextIcon, HelpIcon, PlusIcon } from '../ui/icons';
import { Menu } from '../ui/Menu';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring } from '../ui/motion';

export type CourseAddKind = 'lesson' | 'practice' | 'question-set' | 'checkpoint';

const options = [
  { kind: 'lesson', name: 'Lesson', Icon: FileTextIcon },
  { kind: 'practice', name: 'Card practice', Icon: CardsIcon },
  { kind: 'question-set', name: 'Practice questions', Icon: HelpIcon },
  { kind: 'checkpoint', name: 'Checkpoint', Icon: FlagIcon },
] as const;

/** The shared action surface expands from the button's own corner. */
export function AddCourseControl({
  onAdd,
  kinds,
}: {
  onAdd: (kind: CourseAddKind) => void;
  kinds?: readonly CourseAddKind[];
}) {
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const visible = options.filter((option) => !kinds || kinds.includes(option.kind));
  return (
    <Menu
      label="Add"
      items={visible.map(({ kind, name, Icon }) => ({
        label: name,
        icon: <Icon width={17} height={17} />,
        onSelect: () => onAdd(kind),
      }))}
    >
      {(open) => (
        <>
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open && multiplier > 0 ? 45 : 0 }}
            transition={expandingActionSpring(multiplier)}
          >
            <PlusIcon width={15} height={15} />
          </motion.span>
          Add
        </>
      )}
    </Menu>
  );
}
