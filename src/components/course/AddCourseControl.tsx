import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { CardsIcon, FlagIcon, FileTextIcon, PlusIcon } from '../ui/icons';

import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

export type CourseAddKind = 'lesson' | 'practice' | 'checkpoint';

const options = [
  { kind: 'lesson', name: 'Lesson', Icon: FileTextIcon },
  { kind: 'practice', name: 'Practice', Icon: CardsIcon },
  { kind: 'checkpoint', name: 'Checkpoint', Icon: FlagIcon },
] as const;

/** The button and its choices share one surface, fixed to the button's own corner. */
export function AddCourseControl({ onAdd }: { onAdd: (kind: CourseAddKind) => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionsId = useId();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const reduced = multiplier === 0;
  const transition = reduced
    ? { duration: 0.1 }
    : { type: 'spring' as const, visualDuration: 0.3 * multiplier, bounce: 0 };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div
      ref={container}
      className="course-add-control"
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <motion.div
        className={`course-add-surface ${open ? 'is-open' : ''}`}
        // Animate this isolated surface's dimensions, never a scale inherited by its text.
        initial={false}
        animate={{ width: open ? 216 : 68, height: open ? 186 : 44 }}
        transition={transition}
      >
        <motion.button
          ref={trigger}
          className="course-button course-add-trigger"
          type="button"
          aria-expanded={open}
          aria-controls={optionsId}
          onClick={() => setOpen((value) => !value)}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={transition}
        >
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open && !reduced ? 45 : 0 }}
            transition={transition}
          >
            <PlusIcon width={15} height={15} />
          </motion.span>
          Add
        </motion.button>
        <div inert={!open} aria-hidden={!open || undefined}>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="options"
                id={optionsId}
                role="group"
                aria-label="Add to course"
                className="course-add-options"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 * multiplier }}
              >
                {options.map(({ kind, name, Icon }) => (
                  <motion.button
                    key={name}
                    type="button"
                    className="course-button"
                    whileTap={reduced ? undefined : { scale: 0.97 }}
                    transition={transition}
                    onClick={() => {
                      setOpen(false);
                      trigger.current?.focus();
                      onAdd(kind);
                    }}
                  >
                    <Icon width={17} height={17} />
                    {name}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
