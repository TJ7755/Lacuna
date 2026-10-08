import { Input, fieldLabelClassName, fieldHintClassName } from '../../components/ui/Field';
import { Toggle } from '../../components/ui/Toggle';
import { ChevronDownIcon } from '../../components/ui/icons';

export interface SchedulingFieldsSectionProps {
  newCardsPerDay: string;
  onNewCardsPerDayChange: (value: string) => void;
  /** Commits the current value to the repository. Fired on blur, not on every keystroke. */
  onNewCardsPerDayBlur: () => void;
  maxReviewsPerDay: string;
  onMaxReviewsPerDayChange: (value: string) => void;
  onMaxReviewsPerDayBlur: () => void;
  enableFuzz: boolean;
  onEnableFuzzChange: (value: boolean) => void;
  maxInterval: string;
  onMaxIntervalChange: (value: string) => void;
  onMaxIntervalBlur: () => void;
  /** Placeholder shown when the field is blank, typically the entity's current maximum_interval. */
  maxIntervalPlaceholder: string;
  learningSteps: string;
  onLearningStepsChange: (value: string) => void;
  onLearningStepsBlur: () => void;
  relearningSteps: string;
  onRelearningStepsChange: (value: string) => void;
  onRelearningStepsBlur: () => void;
  leechThreshold: string;
  onLeechThresholdChange: (value: string) => void;
  onLeechThresholdBlur: () => void;
  leechAction: 'suspend' | 'tag' | 'none';
  onLeechActionChange: (value: 'suspend' | 'tag' | 'none') => void;
  dailyReviewGoal: string;
  onDailyReviewGoalChange: (value: string) => void;
  onDailyReviewGoalBlur: () => void;
  sessionTimeLimit: string;
  onSessionTimeLimitChange: (value: string) => void;
  onSessionTimeLimitBlur: () => void;
}

/**
 * Shared scheduling fields for deck/course settings pages: new/review daily caps, target
 * retention, interval fuzz, maximum interval, learning/relearning steps, and leech detection.
 * Task-facing workload and session limits stay visible; low-level scheduler mechanics are grouped
 * in the Advanced scheduling disclosure.
 * Pure controlled component — all state lives with the caller, which also owns the instant-commit
 * mechanics: text/numeric fields commit on blur via the `on*Blur` callbacks (so a half-typed value
 * never reaches the repository), toggles/selects commit directly through their `on*Change`
 * callback. Target retention lives in TargetRecallCard, which leads the settings page.
 */
export function SchedulingFieldsSection({
  newCardsPerDay,
  onNewCardsPerDayChange,
  onNewCardsPerDayBlur,
  maxReviewsPerDay,
  onMaxReviewsPerDayChange,
  onMaxReviewsPerDayBlur,
  enableFuzz,
  onEnableFuzzChange,
  maxInterval,
  onMaxIntervalChange,
  onMaxIntervalBlur,
  maxIntervalPlaceholder,
  learningSteps,
  onLearningStepsChange,
  onLearningStepsBlur,
  relearningSteps,
  onRelearningStepsChange,
  onRelearningStepsBlur,
  leechThreshold,
  onLeechThresholdChange,
  onLeechThresholdBlur,
  leechAction,
  onLeechActionChange,
  dailyReviewGoal,
  onDailyReviewGoalChange,
  onDailyReviewGoalBlur,
  sessionTimeLimit,
  onSessionTimeLimitChange,
  onSessionTimeLimitBlur,
}: SchedulingFieldsSectionProps) {
  return (
    <>
      <label className={fieldLabelClassName}>
        New cards per day
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={newCardsPerDay}
          onChange={(e) => onNewCardsPerDayChange(e.target.value)}
          onBlur={onNewCardsPerDayBlur}
          placeholder="Unlimited"
        />
        <span className={fieldHintClassName}>
          Caps how many never-seen cards a study session introduces each day, so a large course does
          not overwhelm you. Leave blank for unlimited. Reviews of cards you have already started
          are never capped.
        </span>
      </label>

      <label className={fieldLabelClassName}>
        Maximum reviews per day
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={maxReviewsPerDay}
          onChange={(e) => onMaxReviewsPerDayChange(e.target.value)}
          onBlur={onMaxReviewsPerDayBlur}
          placeholder="Unlimited"
        />
        <span className={fieldHintClassName}>
          Caps how many cards you can review in a single day for this course, including re-reviews
          of cards you have already started. Leave blank for unlimited.
        </span>
      </label>

      <label className={fieldLabelClassName}>
        Daily review goal
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={dailyReviewGoal}
          onChange={(e) => onDailyReviewGoalChange(e.target.value)}
          onBlur={onDailyReviewGoalBlur}
          placeholder="No goal"
        />
        <span className={fieldHintClassName}>
          Target number of cards to review per day. When reached, the session ends with a
          &quot;Daily goal reached&quot; message. Leave blank for no goal.
        </span>
      </label>

      <label className={fieldLabelClassName}>
        Session time limit
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={sessionTimeLimit}
          onChange={(e) => onSessionTimeLimitChange(e.target.value)}
          onBlur={onSessionTimeLimitBlur}
          placeholder="No limit"
        />
        <span className={fieldHintClassName}>
          Maximum number of minutes a single study session may run. When the limit is reached, the
          session ends gracefully. Leave blank for no limit.
        </span>
      </label>

      <details className="group pt-2">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Advanced scheduling</span>
            <span className="mt-1 block text-xs leading-5 text-ink-faint">
              Tune intervals, learning steps and leeches.
            </span>
          </span>
          <ChevronDownIcon
            width={18}
            height={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-ink/[0.03] p-4">
          <div className="block text-sm text-ink-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">Interval fuzz</div>
                <span className={fieldHintClassName}>
                  Adds a small random variation to scheduled intervals so cards do not cluster on
                  the same day. Recommended on.
                </span>
              </div>
              <Toggle checked={enableFuzz} onChange={onEnableFuzzChange} label="Fuzz intervals" />
            </div>
          </div>

          <label className={fieldLabelClassName}>
            Maximum interval
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={maxInterval}
              onChange={(e) => onMaxIntervalChange(e.target.value)}
              onBlur={onMaxIntervalBlur}
              placeholder={maxIntervalPlaceholder}
            />
            <span className={fieldHintClassName}>
              Caps the longest scheduled interval in days. Cards that would be scheduled beyond this
              limit are capped here instead. The default is 36,500 days (~100 years).
            </span>
          </label>

          <label className={fieldLabelClassName}>
            Learning steps
            <Input
              value={learningSteps}
              onChange={(e) => onLearningStepsChange(e.target.value)}
              onBlur={onLearningStepsBlur}
              placeholder="e.g. 1m, 10m"
            />
            <span className={fieldHintClassName}>
              Intervals for a new card before it graduates to review. Use values like 1m, 10m, 1d,
              1h separated by commas or spaces.
            </span>
          </label>

          <label className={fieldLabelClassName}>
            Relearning steps
            <Input
              value={relearningSteps}
              onChange={(e) => onRelearningStepsChange(e.target.value)}
              onBlur={onRelearningStepsBlur}
              placeholder="e.g. 10m"
            />
            <span className={fieldHintClassName}>
              Intervals for a card after it lapses, before it returns to review. Use the same format
              as learning steps.
            </span>
          </label>

          <div className="block text-sm text-ink-soft">
            <div className="mb-2 font-medium">Leech detection</div>
            <div className="flex flex-col gap-3">
              <label className={fieldLabelClassName}>
                Leech threshold
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={leechThreshold}
                  onChange={(e) => onLeechThresholdChange(e.target.value)}
                  onBlur={onLeechThresholdBlur}
                  placeholder="8"
                />
                <span className={fieldHintClassName}>
                  Number of lapses (failed reviews) at which a card is treated as a leech. Leave
                  blank for the default of 8.
                </span>
              </label>
              <fieldset className="block text-sm text-ink-soft">
                <legend className={`mb-2 ${fieldLabelClassName}`}>
                  When a card becomes a leech
                </legend>
                <div className="flex flex-col">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="leechAction"
                      value="suspend"
                      checked={leechAction === 'suspend'}
                      onChange={(e) => onLeechActionChange(e.target.value as 'suspend')}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm text-ink-soft">Auto-suspend the card</span>
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="leechAction"
                      value="tag"
                      checked={leechAction === 'tag'}
                      onChange={(e) => onLeechActionChange(e.target.value as 'tag')}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm text-ink-soft">Add a &apos;leech&apos; tag</span>
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="leechAction"
                      value="none"
                      checked={leechAction === 'none'}
                      onChange={(e) => onLeechActionChange(e.target.value as 'none')}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm text-ink-soft">
                      Show the badge only, take no action
                    </span>
                  </label>
                </div>
              </fieldset>
            </div>
          </div>
        </div>
      </details>
    </>
  );
}
