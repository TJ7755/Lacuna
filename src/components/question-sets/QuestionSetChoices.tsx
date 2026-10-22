import { useId, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { scaledSpring } from '../ui/motion';

/**
 * Native radios styled as choices. With `flow`, one drop moves between the options
 * on a shared track (Lacuna Flow continuity); `accentValues` decides which choices
 * fill with accent, so neutral states such as "Not marked" never read as a verdict.
 * While `pending`, the drop gathers into a pulsing bead on the chosen option until a
 * verdict arrives, then flows into it, as typed flashcards do while they are marked.
 */
export function QuestionSetChoices({
  label,
  value,
  options,
  onChange,
  disabled = false,
  describedBy,
  flow = false,
  accentValues,
  pending = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; description?: ReactNode }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  describedBy?: string;
  flow?: boolean;
  accentValues?: (value: string) => boolean;
  pending?: boolean;
}) {
  const name = useId();
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  return (
    <fieldset
      className="qs-choices"
      data-flow={flow || undefined}
      data-pending={(flow && pending) || undefined}
      aria-busy={pending || undefined}
      disabled={disabled}
      aria-describedby={describedBy}
    >
      <legend className={flow ? 'sr-only' : undefined}>{label}</legend>
      <div>
        {options.map((option) => {
          const checked = value === option.value;
          const accent = Boolean(accentValues?.(option.value));
          const waiting = checked && pending;
          return (
            <label key={option.value} data-accent={(checked && accent) || undefined}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              {flow && checked && (
                <motion.span
                  aria-hidden="true"
                  data-choice-drop={waiting ? 'pending' : accent ? 'accent' : 'neutral'}
                  layoutId={multiplier > 0 ? `${name}-drop` : undefined}
                  layoutDependency={`${value}:${waiting}`}
                  transition={scaledSpring(multiplier, 380, 30)}
                  style={{ borderRadius: 9999 }}
                >
                  {waiting && multiplier > 0 ? (
                    <motion.span
                      animate={{ scale: [1, 1.16, 1] }}
                      transition={{
                        duration: 1.6 * multiplier,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      style={{ borderRadius: 9999 }}
                    />
                  ) : (
                    <motion.span
                      initial={multiplier > 0 ? { scaleX: 1.08, scaleY: 0.86 } : false}
                      animate={{ scaleX: 1, scaleY: 1 }}
                      transition={scaledSpring(multiplier, 320, 14)}
                      style={{ borderRadius: 9999 }}
                    />
                  )}
                </motion.span>
              )}
              <span>
                {option.label}
                {option.description}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
