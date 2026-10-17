import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { loadBindings } from '../../state/shortcutBindings';
import { shortcutGroups } from '../../state/shortcutGroups';

export function HelpShortcuts() {
  const groups = shortcutGroups(loadBindings());
  return (
    <div
      role="region"
      aria-label="Keyboard shortcuts table"
      tabIndex={0}
      className="mt-4 overflow-x-auto rounded-xl border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface">
            <th className="px-4 py-3 font-medium text-ink">Action</th>
            <th className="px-4 py-3 font-medium text-ink">Keys</th>
            <th className="px-4 py-3 font-medium text-ink">Where</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {groups.flatMap((group) =>
            group.shortcuts.map((shortcut) => (
              <tr key={`${group.title}-${shortcut.description}`}>
                <td className="px-4 py-3">{shortcut.description}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded border border-line-strong bg-surface px-1.5 py-0.5 text-xs text-ink"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </td>
                <td className="px-4 py-3">{group.title}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TouchExample() {
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  return (
    <div
      aria-hidden="true"
      className="mt-4 flex h-28 max-w-sm items-center justify-between gap-4 overflow-hidden rounded-xl border border-line px-5 text-xs text-ink-soft"
    >
      <span>
        No <span className="text-ink-faint">←</span>
      </span>
      <motion.div
        initial={false}
        animate={
          multiplier === 0
            ? { x: 0, rotate: 0 }
            : { x: [0, 32, 0, -32, 0], rotate: [0, 6, 0, -6, 0] }
        }
        transition={{ duration: 4 * multiplier, times: [0, 0.2, 0.5, 0.7, 1] }}
        className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface text-sm text-ink"
      >
        Answer
      </motion.div>
      <span>
        <span className="text-ink-faint">→</span> Yes
      </span>
    </div>
  );
}

export function CardTypeExamples() {
  return (
    <div aria-label="Card examples" className="mt-4 flex flex-wrap gap-3 text-xs text-ink-soft">
      <span className="rounded-lg border border-line bg-surface px-3 py-2">
        Capital of France? <span className="text-ink-faint">/</span> Paris
      </span>
      <span className="rounded-lg border border-line bg-surface px-3 py-2">
        Water freezes at <mark className="rounded bg-accent-soft px-1 text-accent-ink">[…]</mark> °C
      </span>
      <span className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
        <span aria-hidden="true" className="h-4 w-7 rounded-full border border-line-strong" />
        <span aria-hidden="true" className="h-px w-4 bg-ink-faint" />
        <span className="rounded-full border-2 border-accent-ink px-2">Label?</span>
      </span>
    </div>
  );
}
