import { useId, useRef } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { NewCourseForm } from './NewCourseForm';
import { PlusIcon } from '../ui/icons';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring } from '../ui/motion';

/** Course creation expands from its trigger, retaining the surrounding page. */
export function NewCourseControl({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const transition = expandingActionSpring(multiplier);

  function close() {
    onOpenChange(false);
    trigger.current?.focus();
  }

  return (
    <div className="relative z-[5] h-11 w-[152px] shrink-0">
      <motion.div
        initial={false}
        animate={{
          width: open ? 'min(448px, calc(100vw - 48px))' : 152,
          height: open ? 'auto' : 44,
          borderRadius: open ? 24 : 22,
        }}
        transition={transition}
        // An inset ring rather than a border, so the button fills the full 44px.
        className={`absolute right-0 top-0 overflow-hidden bg-surface-raised ring-1 ring-inset ${open ? 'ring-transparent shadow-[0_24px_48px_-16px_hsl(var(--ink)/0.35),0_0_0_1px_hsl(var(--ink)/0.05)]' : 'ring-line-strong'}`}
      >
        <motion.button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={formId}
          onClick={() => {
            if (open) close();
            else onOpenChange(true);
          }}
          data-press=""
          whileTap={multiplier > 0 ? { scale: 0.97 } : undefined}
          transition={transition}
          className="absolute right-0 top-0 flex min-h-11 w-[152px] items-center justify-center gap-2 px-3 text-sm font-semibold text-ink focus-visible:outline-offset-[-3px]"
        >
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open && multiplier > 0 ? 45 : 0 }}
            transition={transition}
          >
            <PlusIcon width={16} height={16} />
          </motion.span>
          <span>New course</span>
        </motion.button>
        <div inert={!open} aria-hidden={!open || undefined}>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="form"
                id={formId}
                className="pt-11"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 * multiplier }}
              >
                <NewCourseForm inline onClose={close} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
