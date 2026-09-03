import { useEffect, useMemo } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useToast } from '../../components/ui/Toast';
import { ChevronDownIcon } from '../../components/ui/icons';
import { defaultFsrsParameters } from '../../fsrs/params';
import { countReviews } from '../../fsrs/optimise';
import { MIN_OPTIMISE_REVIEWS } from '../../fsrs/optimiseConfig';
import { useOptimiser } from '../../state/useOptimiser';
import { optimiseEnabledForDeck, useAutoOptimiseDefault } from '../../state/optimiseSetting';
import type { Card, FsrsParameters } from '../../db/types';
import type { ReviewHistoryEntry } from '../../db/reviewHistory';
import { SettingsSectionHeading } from './SettingsSectionHeading';

/** Minimal shape an optimisable entity (deck or course) must provide. */
interface OptimisableEntity {
  id: string;
  fsrsParameters: FsrsParameters;
  autoOptimise?: boolean;
}

export interface OptimisationPanelProps {
  entity: OptimisableEntity;
  cards: Card[];
  /** Canonical review events; omitted only for legacy callers. */
  reviewHistory?: ReviewHistoryEntry[];
  /** Persist partial changes to the entity, e.g. via updateDeck or updateCourse. */
  onUpdate: (changes: Partial<OptimisableEntity>) => Promise<void>;
  /** Noun used in user-facing copy, e.g. "deck" or "course". Defaults to "deck". */
  entityLabel?: string;
  headingLevel?: 2 | 3;
}

/**
 * Per-entity FSRS optimisation. Runs the optimiser in a Web Worker over the entity's
 * own review history, shows a before/after of the fit quality (log loss, lower is
 * better), and applies the new weights only on explicit confirmation, taking a
 * restore-point snapshot first. Gated on a minimum review count, and on the
 * per-entity/global "Optimise scheduling" setting. The whole low-level workflow, including its
 * reset path, sits behind an Advanced scheduling disclosure.
 */
export function OptimisationPanel({
  entity,
  cards,
  reviewHistory,
  onUpdate,
  entityLabel = 'deck',
  headingLevel,
}: OptimisationPanelProps) {
  const { notify } = useToast();
  const [globalDefault] = useAutoOptimiseDefault();
  const optimiser = useOptimiser();
  const resetOptimiser = optimiser.reset;
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Cancel an in-flight optimisation if the user navigates to a different entity.
  useEffect(() => {
    return () => {
      resetOptimiser();
    };
  }, [entity.id, resetOptimiser]);

  const reviews = useMemo(() => countReviews(cards, reviewHistory), [cards, reviewHistory]);
  const enabled = optimiseEnabledForDeck(entity.autoOptimise, globalDefault);
  const enoughData = reviews >= MIN_OPTIMISE_REVIEWS;
  const defaultWeights = useMemo(() => defaultFsrsParameters().w, []);
  const hasCustomWeights =
    entity.fsrsParameters.w.length !== defaultWeights.length ||
    entity.fsrsParameters.w.some((weight, index) => weight !== defaultWeights[index]);

  async function applyWeights() {
    if (!optimiser.result || !optimiser.result.isOutOfSampleWin) return;
    // Restore point before touching scheduling weights (reuses the backup mechanism).
    try {
      const { takeAutoBackup } = await import('../../db/backups');
      await takeAutoBackup();
    } catch (e) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('Auto-backup before applying weights failed:', e);
      }
      notify('Could not create a restore point before applying weights.', 'negative');
      return;
    }
    try {
      await onUpdate({
        fsrsParameters: { ...entity.fsrsParameters, w: optimiser.result.w },
      });
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not apply the optimised weights.',
        'negative',
      );
      return;
    }
    optimiser.reset();
    notify('Optimised weights applied.', 'positive');
  }

  async function resetToDefaults() {
    try {
      const { takeAutoBackup } = await import('../../db/backups');
      await takeAutoBackup();
    } catch (e) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('Auto-backup before resetting weights failed:', e);
      }
      notify('Could not create a restore point before resetting weights.', 'negative');
      return;
    }
    try {
      await onUpdate({
        fsrsParameters: {
          ...entity.fsrsParameters,
          w: defaultWeights,
        },
      });
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not reset the scheduling weights.',
        'negative',
      );
      return;
    }
    optimiser.reset();
    notify('Scheduling weights reset to defaults.', 'neutral');
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <div>
        <span className="text-xs uppercase tracking-[0.16em] text-ink-faint">
          Advanced scheduling
        </span>
        <SettingsSectionHeading level={headingLevel} className="mt-1 font-display text-xl">
          Scheduling optimisation
        </SettingsSectionHeading>
      </div>

      <details className="group">
        <summary
          aria-label="Scheduling optimisation"
          className="mt-1 flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
        >
          <span className="min-w-0 text-sm text-ink-soft">
            {enabled ? 'Enabled' : 'Disabled'} for this {entityLabel}. Open to fit scheduling to
            your review history or reset its weights to the recommended defaults.
          </span>
          <ChevronDownIcon
            width={18}
            height={18}
            aria-hidden="true"
            className="mt-1 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="mt-5 border-t border-line pt-5">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-sm text-ink-soft">
              Fit this {entityLabel}&apos;s scheduler to its own review history. Changes apply only
              after confirmation, and Lacuna takes a restore point first.
            </p>
            <Toggle
              checked={enabled}
              onChange={(checked) => void onUpdate({ autoOptimise: checked })}
              label={`Optimise this ${entityLabel}`}
            />
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <AnimatePresence mode="wait">
              {!enoughData ? (
                <motion.p
                  key="not-enough"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 * m }}
                  className="text-sm text-ink-faint"
                >
                  Optimisation needs at least {MIN_OPTIMISE_REVIEWS} reviews so that a held-out
                  validation portion is large enough to judge the fit honestly. This {entityLabel}{' '}
                  has {reviews}. Keep revising and it will become available.
                </motion.p>
              ) : !enabled ? (
                <motion.p
                  key="disabled"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 * m }}
                  className="text-sm text-ink-faint"
                >
                  Optimisation is turned off for this {entityLabel}. Enable it above to fit the
                  weights.
                </motion.p>
              ) : optimiser.status === 'running' ? (
                <motion.div
                  key="running"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 * m }}
                >
                  <p className="mb-2 text-sm text-ink-soft">Optimising over {reviews} reviews…</p>
                  <ProgressBar value={optimiser.progress} />
                </motion.div>
              ) : optimiser.status === 'done' && optimiser.result ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 * m }}
                >
                  <p className="mb-2 text-sm text-ink-soft">
                    Held-out fit quality (log loss, lower is better):{' '}
                    <span className="tabular text-ink">
                      {optimiser.result.before.toFixed(4)} → {optimiser.result.after.toFixed(4)}
                    </span>{' '}
                    over {optimiser.result.scored} scored reviews.
                  </p>
                  {optimiser.result.scored === 0 ? (
                    <p className="mb-3 text-sm text-ink-faint">
                      Not enough recent reviews to validate out of sample. The default weights are
                      recommended.
                    </p>
                  ) : !optimiser.result.isOutOfSampleWin ? (
                    <p className="mb-3 text-sm text-negative">
                      The fitted weights did not beat the defaults on unseen data. Keep the default
                      weights for now.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {optimiser.result.isOutOfSampleWin && optimiser.result.scored > 0 && (
                      <Button variant="primary" size="sm" onClick={applyWeights}>
                        Apply optimised weights
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => optimiser.reset()}>
                      Discard
                    </Button>
                  </div>
                </motion.div>
              ) : optimiser.status === 'error' ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 * m }}
                >
                  <p className="mb-2 text-sm text-negative">
                    Optimisation failed: {optimiser.error}
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => optimiser.reset()}>
                    Dismiss
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 * m }}
                  className="flex flex-wrap gap-2"
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      optimiser.run(cards, entity.fsrsParameters.requestRetention, reviewHistory)
                    }
                  >
                    Optimise now
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {hasCustomWeights && (
            <div className="mt-4 border-t border-line pt-4">
              <Button variant="ghost" size="sm" onClick={resetToDefaults}>
                Reset to defaults
              </Button>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
