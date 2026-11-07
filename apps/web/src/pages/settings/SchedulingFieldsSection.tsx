import { Input, fieldLabelClassName, fieldHintClassName } from '../../components/ui/Field';
import { Toggle } from '../../components/ui/Toggle';
import { InlineSettingsDisclosure } from './InlineSettingsDisclosure';

export interface SchedulingFieldsSectionProps {
  /** Select a group for course settings; other callers retain the complete form. */
  section?: 'workload' | 'advanced';
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
  section,
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
  const advancedFields = (
    <div
      className={
        section === 'advanced'
          ? 'flex flex-col gap-4'
          : 'mt-5 flex flex-col gap-4 rounded-2xl bg-ink/[0.03] p-4'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">Vary review intervals</span>
        <Toggle
          checked={enableFuzz}
          onChange={onEnableFuzzChange}
          ariaLabel="Vary review intervals"
        />
      </div>

      <label className={fieldLabelClassName}>
        Maximum interval (days)
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={maxInterval}
          onChange={(e) => onMaxIntervalChange(e.target.value)}
          onBlur={onMaxIntervalBlur}
          placeholder={maxIntervalPlaceholder}
        />
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
          Comma- or space-separated durations, e.g. 1m, 10m, 1h, 1d.
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
      </label>

      <div className="block text-sm text-ink-soft">
        <div className="mb-2 text-sm font-semibold text-ink">Leech detection</div>
        <div className="flex flex-col gap-3">
          <label className={fieldLabelClassName}>
            Failed reviews to flag a leech
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={leechThreshold}
              onChange={(e) => onLeechThresholdChange(e.target.value)}
              onBlur={onLeechThresholdBlur}
              placeholder="8"
            />
          </label>
          <fieldset className="block text-sm text-ink-soft">
            <legend className={`mb-2 ${fieldLabelClassName}`}>When a card becomes a leech</legend>
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
                <span className="text-sm text-ink-soft">Show the badge only, take no action</span>
              </label>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {section !== 'advanced' && (
        <div className={section === 'workload' ? 'grid gap-4 sm:grid-cols-2' : 'contents'}>
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
            <span className={section === 'workload' ? 'sr-only' : fieldHintClassName}>
              Blank for unlimited.
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
            <span className={section === 'workload' ? 'sr-only' : fieldHintClassName}>
              Blank for unlimited.
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
            <span className={section === 'workload' ? 'sr-only' : fieldHintClassName}>
              Ends the session at this count. Blank for no goal.
            </span>
          </label>

          <label className={fieldLabelClassName}>
            Session time limit (min)
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={sessionTimeLimit}
              onChange={(e) => onSessionTimeLimitChange(e.target.value)}
              onBlur={onSessionTimeLimitBlur}
              placeholder="No limit"
            />
            <span className={section === 'workload' ? 'sr-only' : fieldHintClassName}>
              Blank for no limit.
            </span>
          </label>
        </div>
      )}
      {section === 'advanced' ? (
        advancedFields
      ) : section !== 'workload' ? (
        <InlineSettingsDisclosure
          className="pt-2"
          headerClassName="flex min-h-11 items-center justify-between gap-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          header={<span className="text-sm font-semibold text-ink">Advanced scheduling</span>}
        >
          {advancedFields}
        </InlineSettingsDisclosure>
      ) : null}
    </>
  );
}
