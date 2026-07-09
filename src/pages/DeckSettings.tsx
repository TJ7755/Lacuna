import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useCards, useDeck } from '../state/useData';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { useToast } from '../components/ui/Toast';
import {
  deleteDecks,
  restoreDecks,
  snapshotDecks,
  updateDeck,
} from '../db/repository';
import {
  fromDateTimeLocalValue,
  formatDateTime,
  getLocalTimeZone,
  toDateTimeLocalValue,
} from '../utils/datetime';
import { DateTimePicker } from '../components/ui/DateTimePicker';
import { clampRequestRetention, DEFAULT_REQUEST_RETENTION } from '../fsrs/params';
import { ChevronLeftIcon } from '../components/ui/icons';
import { cn } from '../components/ui/cn';
import { DECK_COLOURS } from '../db/types';
import type { ExamObjective } from '../db/types';
import { parseSteps } from './settings/parseSteps';
import { SchedulingFieldsSection } from './settings/SchedulingFieldsSection';
import { OptimisationPanel } from './settings/OptimisationPanel';
import { DangerZoneSection } from './settings/DangerZoneSection';

/**
 * Full-page deck settings, replacing the old modal. Lets the user rename a deck, set its
 * exam date and objective, and delete it. Deletion is immediate with an "Undo" toast
 * rather than a blocking confirmation dialog.
 */
export function DeckSettings() {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();

  const deck = useDeck(deckId);
  const cards = useCards(deckId);

  const [name, setName] = useState('');
  const [examValue, setExamValue] = useState('');
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);
  const [objective, setObjective] = useState<ExamObjective>('expectedMarks');
  const [newPerDay, setNewPerDay] = useState('');
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState('');
  const [retention, setRetention] = useState(DEFAULT_REQUEST_RETENTION);
  const [colour, setColour] = useState<string | undefined>(undefined);
  const [enableFuzz, setEnableFuzz] = useState(true);
  const [maxInterval, setMaxInterval] = useState('');
  const [learningSteps, setLearningSteps] = useState('');
  const [relearningSteps, setRelearningSteps] = useState('');
  const [leechThreshold, setLeechThreshold] = useState('');
  const [leechAction, setLeechAction] = useState<'suspend' | 'tag' | 'none'>('suspend');
  const [dailyReviewGoal, setDailyReviewGoal] = useState('');
  const [sessionTimeLimit, setSessionTimeLimit] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Re-arm the loaded latch whenever the deck changes so back/forward navigation
  // between different deck settings routes re-seeds the formotion.
  useEffect(() => {
    setLoaded(false);
  }, [deckId]);

  useEffect(() => {
    if (loaded || !deck) return;
    setName(deck.name);
    setExamValue(toDateTimeLocalValue(deck.examDate, deck.timeZone));
    setTimeZone(deck.timeZone);
    setObjective(deck.examObjective);
    setNewPerDay(deck.newCardsPerDay ? String(deck.newCardsPerDay) : '');
    setMaxReviewsPerDay(deck.maxReviewsPerDay ? String(deck.maxReviewsPerDay) : '');
    setRetention(clampRequestRetention(deck.fsrsParameters.requestRetention));
    setColour(deck.colour);
    setEnableFuzz(deck.fsrsParameters.enable_fuzz ?? true);
    setMaxInterval(deck.fsrsParameters.maximum_interval ? String(deck.fsrsParameters.maximum_interval) : '');
    setLearningSteps(deck.fsrsParameters.learning_steps.join(', '));
    setRelearningSteps(deck.fsrsParameters.relearning_steps.join(', '));
    setLeechThreshold(deck.leechThreshold ? String(deck.leechThreshold) : '');
    setLeechAction(deck.leechAction ?? 'suspend');
    setDailyReviewGoal(deck.dailyReviewGoal ? String(deck.dailyReviewGoal) : '');
    setSessionTimeLimit(deck.sessionTimeLimitMinutes ? String(deck.sessionTimeLimitMinutes) : '');
    setLoaded(true);
  }, [deck, loaded]);

  if (deck === undefined) {
    return <DeckSettingsSkeleton />;
  }
  if (deck === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This deck could not be found.</p>
        <Link to="/" className="text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const deckPath = `/deck/${deck.id}`;

  async function handleSave() {
    if (!deck) return;
    const ms = fromDateTimeLocalValue(examValue, timeZone);
    const parsedCap = Math.floor(Number(newPerDay));
    const newCardsPerDay =
      newPerDay.trim() === '' || !Number.isFinite(parsedCap) || parsedCap <= 0
        ? undefined
        : parsedCap;
    const parsedReviews = Math.floor(Number(maxReviewsPerDay));
    const maxReviewsPerDayValue =
      maxReviewsPerDay.trim() === '' || !Number.isFinite(parsedReviews) || parsedReviews <= 0
        ? undefined
        : parsedReviews;
    const parsedMaxInterval = Math.floor(Number(maxInterval));
    const maxIntervalValue =
      maxInterval.trim() === '' || !Number.isFinite(parsedMaxInterval) || parsedMaxInterval <= 0
        ? deck.fsrsParameters.maximum_interval
        : parsedMaxInterval;
    const parsedLeechThreshold = Math.floor(Number(leechThreshold));
    const leechThresholdValue =
      leechThreshold.trim() === '' || !Number.isFinite(parsedLeechThreshold) || parsedLeechThreshold <= 0
        ? undefined
        : parsedLeechThreshold;
    const parsedDailyGoal = Math.floor(Number(dailyReviewGoal));
    const dailyReviewGoalValue =
      dailyReviewGoal.trim() === '' || !Number.isFinite(parsedDailyGoal) || parsedDailyGoal <= 0
        ? undefined
        : parsedDailyGoal;
    const parsedTimeLimit = Math.floor(Number(sessionTimeLimit));
    const sessionTimeLimitValue =
      sessionTimeLimit.trim() === '' || !Number.isFinite(parsedTimeLimit) || parsedTimeLimit <= 0
        ? undefined
        : parsedTimeLimit;
    const learningStepsValue = parseSteps(learningSteps);
    if (learningSteps.trim() && learningStepsValue === null) {
      notify('Invalid learning steps format. Use values like 1m, 10m, 1d.', 'negative');
      return;
    }
    const relearningStepsValue = parseSteps(relearningSteps);
    if (relearningSteps.trim() && relearningStepsValue === null) {
      notify('Invalid relearning steps format. Use values like 1m, 10m, 1d.', 'negative');
      return;
    }
    await updateDeck(deck.id, {
      name: name.trim() || deck.name,
      examDate: Number.isNaN(ms) ? deck.examDate : ms,
      timeZone: timeZone ?? getLocalTimeZone(),
      examObjective: objective,
      newCardsPerDay,
      maxReviewsPerDay: maxReviewsPerDayValue,
      colour,
      leechThreshold: leechThresholdValue,
      leechAction,
      dailyReviewGoal: dailyReviewGoalValue,
      sessionTimeLimitMinutes: sessionTimeLimitValue,
      fsrsParameters: {
        ...deck.fsrsParameters,
        requestRetention: clampRequestRetention(retention),
        enable_fuzz: enableFuzz,
        maximum_interval: maxIntervalValue,
        learning_steps: learningStepsValue ?? deck.fsrsParameters.learning_steps,
        relearning_steps: relearningStepsValue ?? deck.fsrsParameters.relearning_steps,
      },
    });
    notify('Deck updated.', 'positive');
    navigate(deckPath);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      <Link
        to={deckPath}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        Back to {deck.name}
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 * m }}
      >
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 * m, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8"
        >
          <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
          <div className="relative">
            <p className="mb-1 text-sm uppercase tracking-[0.18em] text-ink-faint">
              Deck
            </p>
            <h1 className="font-display text-4xl tracking-tight md:text-5xl">Settings</h1>
          </div>
        </motion.header>

        <div className="flex flex-col gap-6">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, delay: 0.05 * m, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
          >
            <div className="flex flex-col gap-4">
              <label className="block text-sm text-ink-soft">
                Deck name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
                />
              </label>

              {/* Colour picker */}
              <div className="block text-sm text-ink-soft">
                <div className="mb-2">Deck colour</div>
                <div className="flex flex-wrap gap-2">
                  {DECK_COLOURS.map((c) => {
                    const active = colour === c.hex;
                    return (                        <motion.button
                        key={c.key}
                        type="button"
                        title={c.label}
                        onClick={() => setColour(active ? undefined : c.hex)}
                        aria-pressed={active}
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.9 }}
                        transition={{ duration: 0.12 * m }}
                        className={cn(
                          'h-8 w-8 rounded-full transition-all duration-150',
                          active
                            ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink'
                            : 'hover:scale-110',
                        )}
                        style={{ backgroundColor: c.hex }}
                      />
                    );
                  })}
                </div>
                <span className="mt-1 block text-xs text-ink-faint">
                  Pick a colour to help identify this deck on the dashboard and in the sidebar.
                </span>
              </div>

              <DateTimePicker
                value={fromDateTimeLocalValue(examValue, timeZone) || deck.examDate}
                onChange={(ms) => setExamValue(toDateTimeLocalValue(ms, timeZone))}
                timeZone={timeZone}
                label="Exam date and time"
              />
              {timeZone && (
                <span className="text-xs text-ink-faint">
                  {formatDateTime(deck.examDate, timeZone)} ({timeZone})
                </span>
              )}

              <div className="block text-sm text-ink-soft">
                <div className="mb-2">Exam objective</div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-ink-faint">
                    {objective === 'securedTopics'
                      ? 'Secure as many topics as possible: prioritise cards a review would push to 90%+ on exam day. The progress bar shows the fraction of cards secured.'
                      : 'Maximise your expected marks: prioritise the largest expected lift to exam-day retrievability. The progress bar shows your mean predicted retrievability.'}
                  </p>
                  <Toggle
                    checked={objective === 'securedTopics'}
                    onChange={(checked) =>
                      setObjective(checked ? 'securedTopics' : 'expectedMarks')
                    }
                    label="Secure topics"
                  />
                </div>
              </div>

              <SchedulingFieldsSection
                newCardsPerDay={newPerDay}
                onNewCardsPerDayChange={setNewPerDay}
                maxReviewsPerDay={maxReviewsPerDay}
                onMaxReviewsPerDayChange={setMaxReviewsPerDay}
                retention={retention}
                onRetentionChange={setRetention}
                enableFuzz={enableFuzz}
                onEnableFuzzChange={setEnableFuzz}
                maxInterval={maxInterval}
                onMaxIntervalChange={setMaxInterval}
                maxIntervalPlaceholder={String(deck.fsrsParameters.maximum_interval ?? 36500)}
                learningSteps={learningSteps}
                onLearningStepsChange={setLearningSteps}
                relearningSteps={relearningSteps}
                onRelearningStepsChange={setRelearningSteps}
                leechThreshold={leechThreshold}
                onLeechThresholdChange={setLeechThreshold}
                leechAction={leechAction}
                onLeechActionChange={setLeechAction}
                dailyReviewGoal={dailyReviewGoal}
                onDailyReviewGoalChange={setDailyReviewGoal}
                sessionTimeLimit={sessionTimeLimit}
                onSessionTimeLimitChange={setSessionTimeLimit}
              />
            </div>
          </motion.section>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, delay: 0.1 * m, ease: [0.16, 1, 0.3, 1] }}
          >
            <OptimisationPanel
              entity={deck}
              cards={cards ?? []}
              onUpdate={(changes) => updateDeck(deck.id, changes)}
            />
          </motion.div>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, delay: 0.15 * m, ease: [0.16, 1, 0.3, 1] }}
          >
            <DangerZoneSection
              entityLabel="deck"
              entityName={deck.name}
              description="Deleting this deck removes all of its cards and history. You will have a moment to undo."
              snapshot={() => snapshotDecks([deck.id])}
              onDelete={() => deleteDecks([deck.id])}
              onRestore={(snap) => restoreDecks(snap as Awaited<ReturnType<typeof snapshotDecks>>)}
              onDeleted={() => navigate('/')}
            />
          </motion.section>
        </div>
      </motion.div>

      {/* Sticky action bar (stays within the content column, clear of the sidebar) */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 * m, delay: 0.2 * m, ease: [0.16, 1, 0.3, 1] }}
        className="sticky bottom-0 z-30 -mx-6 mt-8 border-t border-line bg-paper/80 px-6 py-4 backdrop-blur-xl md:-mx-10 md:px-10"
      >
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => navigate(deckPath)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function DeckSettingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mb-8 space-y-3">
        <div className="h-3 w-20 animate-pulse rounded bg-ink/10" />
        <div className="h-10 w-48 animate-pulse rounded bg-ink/10" />
      </div>
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-line bg-surface p-6 space-y-4">
          <div className="h-4 w-full animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-ink/10" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-ink/10" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 space-y-3">
          <div className="h-4 w-40 animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-full animate-pulse rounded bg-ink/10" />
          <div className="h-8 w-32 animate-pulse rounded-lg bg-ink/10" />
        </div>
        <div className="rounded-2xl border border-negative/30 bg-negative/5 p-6 space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-full animate-pulse rounded bg-ink/10" />
          <div className="h-8 w-28 animate-pulse rounded-lg bg-ink/10" />
        </div>
      </div>
    </div>
  );
}
