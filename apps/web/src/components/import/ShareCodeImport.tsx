import type { PendingShareImport } from './useShareCodeImport';
import { AnimatePresence, m as motion } from 'motion/react';
import { formatDate } from '../../utils/datetime';
import { Button } from '../ui/Button';

export function ShareCodeImport({
  text,
  setText,
  pending,
  notice,
  onImport,
  onClear,
  importing,
  m,
}: {
  text: string;
  setText: (v: string) => void;
  pending: PendingShareImport | null;
  notice: string | null;
  onImport: () => void;
  onClear: () => void;
  importing: boolean;
  m: number;
}) {
  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-all focus-within:border-accent/60">
        <label className="mb-2.5 block text-sm text-ink-soft">Share code</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          autoFocus
          placeholder="Paste a Lacuna share code here (it starts with LAC)..."
          className="w-full resize-none break-all rounded-xl border border-line bg-surface-raised/30 px-4 py-3 font-mono text-xs text-ink outline-none transition-all focus:border-accent/40 placeholder:text-ink-faint"
        />
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={m > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={m > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4"
          >
            <div className="rounded-3xl bg-accent-soft/40 p-5 text-sm leading-relaxed text-ink-soft">
              {notice}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pending && (
          <motion.div
            initial={m > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={m > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4"
          >
            <div className="rounded-3xl bg-accent-soft/40 p-5">
              <h3 className="mb-2 font-display text-lg font-medium text-ink">
                {pending.merge ? 'Course update' : 'Ready to import'}
              </h3>
              {pending.merge ? (
                <p className="mb-3 text-sm leading-relaxed text-ink-soft">
                  {pending.merge.stale ? (
                    <>
                      You already have the latest version of{' '}
                      <strong className="text-ink">{pending.merge.course.name}</strong> (revision{' '}
                      {pending.merge.course.distributedCopy?.revision ?? 0}).
                    </>
                  ) : (
                    <>
                      This updates <strong className="text-ink">{pending.merge.course.name}</strong>{' '}
                      (revision {pending.merge.course.distributedCopy?.revision ?? 0} →{' '}
                      {pending.merge.incomingRevision}).
                    </>
                  )}
                </p>
              ) : pending.summary.kind === 'course' ? (
                <p className="mb-3 text-sm leading-relaxed text-ink-soft">
                  <strong className="text-ink">{pending.summary.courseName}</strong> —{' '}
                  <strong className="text-ink">{pending.summary.lessonCount}</strong> lesson
                  {pending.summary.lessonCount === 1 ? '' : 's'},{' '}
                  <strong className="text-ink">{pending.summary.noteCount ?? 0}</strong> note
                  {pending.summary.noteCount === 1 ? '' : 's'} and{' '}
                  <strong className="text-ink">{pending.summary.cardCount}</strong> card
                  {pending.summary.cardCount === 1 ? '' : 's'}, shared on{' '}
                  {formatDate(pending.summary.exportedAt)}.
                </p>
              ) : (
                <p className="mb-3 text-sm leading-relaxed text-ink-soft">
                  This code contains{' '}
                  <strong className="text-ink">{pending.summary.deckCount}</strong> deck
                  {pending.summary.deckCount === 1 ? '' : 's'} and{' '}
                  <strong className="text-ink">{pending.summary.cardCount}</strong> card
                  {pending.summary.cardCount === 1 ? '' : 's'}, shared on{' '}
                  {formatDate(pending.summary.exportedAt)}. It will be added as a single imported
                  course.
                </p>
              )}
              {!pending.merge && pending.summary.omittedImages && (
                <p className="mb-4 rounded-2xl bg-ink/[0.06] px-4 py-3 text-sm leading-relaxed text-ink-soft">
                  This share code omitted media to keep the code small. Images and audio will appear
                  as placeholders after import.
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={onClear}>
                  {pending.merge?.stale ? 'Close' : 'Cancel'}
                </Button>
                {!pending.merge?.stale && (
                  <Button variant="primary" onClick={() => void onImport()} disabled={importing}>
                    {importing
                      ? pending.merge
                        ? 'Updating…'
                        : 'Importing…'
                      : pending.merge
                        ? 'Update course'
                        : 'Add to my courses'}
                  </Button>
                )}
              </div>
              {!pending.merge && pending.summary.deckNames.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {pending.summary.deckNames.map((name, i) => (
                    <li
                      key={`${name}-${i}`}
                      className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-ink"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
