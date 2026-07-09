import { m as motion } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { Toggle } from '../../components/ui/Toggle';
import { cn } from '../../components/ui/cn';
import {
  DEFAULT_REQUEST_RETENTION,
  MAX_REQUEST_RETENTION,
  MIN_REQUEST_RETENTION,
} from '../../fsrs/params';

/** Named anchor points for the target-retention slider. */
const RETENTION_PRESETS = [
  { label: 'Relaxed', value: 0.85 },
  { label: 'Balanced', value: 0.9 },
  { label: 'Thorough', value: 0.95 },
] as const;

export interface SchedulingFieldsSectionProps {
  newCardsPerDay: string;
  onNewCardsPerDayChange: (value: string) => void;
  maxReviewsPerDay: string;
  onMaxReviewsPerDayChange: (value: string) => void;
  retention: number;
  onRetentionChange: (value: number) => void;
  enableFuzz: boolean;
  onEnableFuzzChange: (value: boolean) => void;
  maxInterval: string;
  onMaxIntervalChange: (value: string) => void;
  /** Placeholder shown when the field is blank, typically the entity's current maximum_interval. */
  maxIntervalPlaceholder: string;
  learningSteps: string;
  onLearningStepsChange: (value: string) => void;
  relearningSteps: string;
  onRelearningStepsChange: (value: string) => void;
  leechThreshold: string;
  onLeechThresholdChange: (value: string) => void;
  leechAction: 'suspend' | 'tag' | 'none';
  onLeechActionChange: (value: 'suspend' | 'tag' | 'none') => void;
  dailyReviewGoal: string;
  onDailyReviewGoalChange: (value: string) => void;
  sessionTimeLimit: string;
  onSessionTimeLimitChange: (value: string) => void;
}

/**
 * Shared scheduling fields for deck/course settings pages: new/review daily caps, target
 * retention, interval fuzz, maximum interval, learning/relearning steps, and leech detection.
 * Pure controlled component — all state lives with the caller.
 */
export function SchedulingFieldsSection({
  newCardsPerDay,
  onNewCardsPerDayChange,
  maxReviewsPerDay,
  onMaxReviewsPerDayChange,
  retention,
  onRetentionChange,
  enableFuzz,
  onEnableFuzzChange,
  maxInterval,
  onMaxIntervalChange,
  maxIntervalPlaceholder,
  learningSteps,
  onLearningStepsChange,
  relearningSteps,
  onRelearningStepsChange,
  leechThreshold,
  onLeechThresholdChange,
  leechAction,
  onLeechActionChange,
  dailyReviewGoal,
  onDailyReviewGoalChange,
  sessionTimeLimit,
  onSessionTimeLimitChange,
}: SchedulingFieldsSectionProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  return (
    <>
      <label className="block text-sm text-ink-soft">
        New cards per day
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={newCardsPerDay}
          onChange={(e) => onNewCardsPerDayChange(e.target.value)}
          placeholder="Unlimited"
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Caps how many never-seen cards a study session introduces each day, so a
          large deck does not overwhelm you. Leave blank for unlimited. Reviews of
          cards you have already started are never capped.
        </span>
      </label>

      <label className="block text-sm text-ink-soft">
        Maximum reviews per day
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={maxReviewsPerDay}
          onChange={(e) => onMaxReviewsPerDayChange(e.target.value)}
          placeholder="Unlimited"
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Caps how many cards you can review in a single day for this deck, including
          re-reviews of cards you have already started. Leave blank for unlimited.
        </span>
      </label>

      <div className="block text-sm text-ink-soft">
        <div className="flex items-baseline justify-between">
          <span>Target retention</span>
          <span className="tabular font-medium text-ink">
            {Math.round(retention * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={MIN_REQUEST_RETENTION}
          max={MAX_REQUEST_RETENTION}
          step={0.01}
          value={retention}
          onChange={(e) => onRetentionChange(Number(e.target.value))}
          aria-label="Target retention"
          className="mt-3 w-full accent-accent"
        />
        <div className="mt-2 flex gap-2">
          {RETENTION_PRESETS.map((p) => {
            const active = Math.round(retention * 100) === Math.round(p.value * 100);
            return (
              <motion.button
                key={p.label}
                type="button"
                onClick={() => onRetentionChange(p.value)}
                aria-pressed={active}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.1 * m }}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-xs transition-colors',
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-ink-soft hover:border-line-strong',
                )}
              >
                <span className="block font-medium">{p.label}</span>
                <span className="text-ink-faint">{Math.round(p.value * 100)}%</span>
              </motion.button>
            );
          })}
        </div>
        <span className="mt-2 block text-xs text-ink-faint">
          How well you want to remember each card. Higher means cards come back sooner
          and more often (more reviews, fewer lapses); lower means a lighter workload
          with more forgetting. {Math.round(retention * 100)}% is{' '}
          {retention > DEFAULT_REQUEST_RETENTION
            ? 'more thorough than the default.'
            : retention < DEFAULT_REQUEST_RETENTION
              ? 'lighter than the default.'
              : 'the recommended default.'}
        </span>
      </div>

      <div className="block text-sm text-ink-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">Interval fuzz</div>
            <span className="mt-1 block text-xs text-ink-faint">
              Adds a small random variation to scheduled intervals so cards do not cluster
              on the same day. Recommended on.
            </span>
          </div>
          <Toggle
            checked={enableFuzz}
            onChange={onEnableFuzzChange}
            label="Fuzz intervals"
          />
        </div>
      </div>

      <label className="block text-sm text-ink-soft">
        Maximum interval
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={maxInterval}
          onChange={(e) => onMaxIntervalChange(e.target.value)}
          placeholder={maxIntervalPlaceholder}
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Caps the longest scheduled interval in days. Cards that would be scheduled beyond
          this limit are capped here instead. The default is 36,500 days (~100 years).
        </span>
      </label>

      <label className="block text-sm text-ink-soft">
        Learning steps
        <input
          value={learningSteps}
          onChange={(e) => onLearningStepsChange(e.target.value)}
          placeholder="e.g. 1m, 10m"
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Intervals for a new card before it graduates to review. Use values like
          1m, 10m, 1d, 1h separated by commas or spaces.
        </span>
      </label>

      <label className="block text-sm text-ink-soft">
        Relearning steps
        <input
          value={relearningSteps}
          onChange={(e) => onRelearningStepsChange(e.target.value)}
          placeholder="e.g. 10m"
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Intervals for a card after it lapses, before it returns to review. Use the same
          format as learning steps.
        </span>
      </label>

      <div className="block text-sm text-ink-soft">
        <div className="mb-2 font-medium">Leech detection</div>
        <div className="flex flex-col gap-3">
          <label className="block text-sm text-ink-soft">
            Leech threshold
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={leechThreshold}
              onChange={(e) => onLeechThresholdChange(e.target.value)}
              placeholder="8"
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              Number of lapses (failed reviews) at which a card is treated as a leech.
              Leave blank for the default of 8.
            </span>
          </label>
          <label className="block text-sm text-ink-soft">
            Daily review goal
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={dailyReviewGoal}
              onChange={(e) => onDailyReviewGoalChange(e.target.value)}
              placeholder="Unlimited"
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              Target number of cards to review per day. When reached, the session
              ends with a &quot;Daily goal reached&quot; message. Leave blank for no goal.
            </span>
          </label>
          <label className="block text-sm text-ink-soft">
            Session time limit
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={sessionTimeLimit}
              onChange={(e) => onSessionTimeLimitChange(e.target.value)}
              placeholder="Unlimited"
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              Maximum number of minutes a single study session may run. When the
              limit is reached, the session ends gracefully. Leave blank for no limit.
            </span>
          </label>
          <fieldset className="block text-sm text-ink-soft">
            <legend className="mb-2">When a card becomes a leech</legend>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="leechAction"
                  value="suspend"
                  checked={leechAction === 'suspend'}
                  onChange={(e) => onLeechActionChange(e.target.value as 'suspend')}
                  className="accent-accent"
                />
                <span className="text-sm text-ink-soft">Auto-suspend the card</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="leechAction"
                  value="tag"
                  checked={leechAction === 'tag'}
                  onChange={(e) => onLeechActionChange(e.target.value as 'tag')}
                  className="accent-accent"
                />
                <span className="text-sm text-ink-soft">Add a &apos;leech&apos; tag</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="leechAction"
                  value="none"
                  checked={leechAction === 'none'}
                  onChange={(e) => onLeechActionChange(e.target.value as 'none')}
                  className="accent-accent"
                />
                <span className="text-sm text-ink-soft">Show the badge only, take no action</span>
              </label>
            </div>
          </fieldset>
        </div>
      </div>
    </>
  );
}
