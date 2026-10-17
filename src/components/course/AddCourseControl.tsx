import { m as motion } from 'motion/react';
import { CardsIcon, FlagIcon, FileTextIcon, HelpIcon, PlusIcon } from '../ui/icons';
import { Menu } from '../ui/Menu';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring } from '../ui/motion';

export type CourseAddKind = 'lesson' | 'practice' | 'question-set' | 'checkpoint';

const options = [
  { kind: 'lesson', name: 'Lesson', description: 'Learn new cards', Icon: FileTextIcon },
  {
    kind: 'practice',
    name: 'Card practice',
    description: 'Revise earlier lessons',
    Icon: CardsIcon,
  },
  {
    kind: 'question-set',
    name: 'Practice questions',
    description: 'Answer exam-style questions',
    Icon: HelpIcon,
  },
  {
    kind: 'checkpoint',
    name: 'Checkpoint',
    description: 'A dated test to prepare for',
    Icon: FlagIcon,
  },
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
      items={visible.map(({ kind, name, description, Icon }) => ({
        label: name,
        description,
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
