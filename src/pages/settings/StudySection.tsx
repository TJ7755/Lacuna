import { ChevronDownIcon, FlameIcon } from '../../components/ui/icons';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { Toggle } from '../../components/ui/Toggle';
import { MIN_OPTIMISE_REVIEWS } from '../../fsrs/optimiseConfig';
import { useAnswerStrictness, type AnswerStrictness } from '../../state/answerStrictness';
import { useStartInFocusMode } from '../../state/focusModePreference';
import { useGradingMode } from '../../state/gradingMode';
import { useAutoOptimiseDefault } from '../../state/optimiseSetting';
import { usePracticeDefaults } from '../../state/practiceDefaults';
import { useTypingSetting } from '../../state/typingSetting';
import { cn } from '../../components/ui/cn';
import { AUDIO_PLAYBACK_SPEEDS, useAudioSettings } from '../../state/audioSettings';
import { useAfterFinalExamPolicy, type AfterFinalExamPolicy } from '../../state/finalExamLifecycle';

const FINAL_EXAM_POLICIES: Array<{
  value: AfterFinalExamPolicy;
  label: string;
  description: string;
}> = [
  { value: 'ask', label: 'Ask me', description: 'Choose when the final exam passes.' },
  { value: 'archive', label: 'Archive automatically', description: 'Move it out of active study.' },
  { value: 'keep-revising', label: 'Keep revising', description: 'Continue steady maintenance.' },
];

export function StudySection() {
  const [gradingMode, setGradingMode] = useGradingMode();
  const [typingSetting, setTypingSetting] = useTypingSetting();
  const [answerStrictness, setAnswerStrictness] = useAnswerStrictness();
  const [startInFocusMode, setStartInFocusMode] = useStartInFocusMode();
  const [audioSettings, setAudioSettings] = useAudioSettings();

  return (
    <section id="settings-study" className="mb-8 rounded-2xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center gap-2 text-accent">
        <FlameIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl">
          Session behaviour
        </SettingsSectionHeading>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Choose how sessions present cards, collect answers and keep you focused.
      </p>

      <SettingToggle
        title="Manual four-point grading"
        description="By default Lacuna grades silently from whether you were right and how long you took, so you only press Yes or No. Turn this on to grade each card yourself with the four FSRS buttons (Again, Hard, Good, Easy) and their keyboard shortcuts."
        checked={gradingMode === 'manual'}
        onChange={(checked) => setGradingMode(checked ? 'manual' : 'silent')}
      />
      <SettingToggle
        bordered
        title="Type your answer"
        description="Type the answer before reveal instead of just flipping the card. Works for front/back, reversed and cloze cards; the typed answer is compared against the correct one, but you still grade yourself."
        checked={typingSetting === 'type'}
        onChange={(checked) => setTypingSetting(checked ? 'type' : 'reveal')}
      />

      <SettingToggle
        bordered
        title="Autoplay audio cards"
        description="Start an audio clip when its question face appears. Browser autoplay rules can still require the first play to be started manually."
        checked={audioSettings.autoplay}
        onChange={(autoplay) => setAudioSettings({ ...audioSettings, autoplay })}
      />
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm">Audio playback speed</div>
          <p className="mt-1 text-sm text-ink-soft">Applied to every audio card on this device.</p>
        </div>
        <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="Audio playback speed">
          {AUDIO_PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              role="radio"
              aria-checked={audioSettings.playbackSpeed === speed}
              onClick={() => setAudioSettings({ ...audioSettings, playbackSpeed: speed })}
              className={cn(
                'min-h-11 rounded-lg border px-3 py-1.5 text-xs transition-colors',
                audioSettings.playbackSpeed === speed
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      {typingSetting === 'type' && (
        <div className="mt-5 flex items-center justify-between gap-3 pl-0">
          <div className="min-w-0">
            <div className="text-sm">Grading strictness</div>
            <p className="mt-1 text-sm text-ink-soft">
              How closely a typed answer must match. Lenient ignores case and punctuation, standard
              ignores case only, exact requires both to match.
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {(['lenient', 'standard', 'exact'] as AnswerStrictness[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setAnswerStrictness(level)}
                aria-pressed={answerStrictness === level}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs capitalize transition-colors',
                  answerStrictness === level
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-ink-soft hover:border-line-strong',
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-start justify-between gap-3 border-t border-line pt-5">
        <div className="min-w-0">
          <label htmlFor="start-in-focus-mode" className="text-sm">
            Start Learn sessions in Focus Mode
          </label>
          <p className="mt-1 text-sm text-ink-soft">
            Hide session controls when Learn opens. Press Esc at any time to leave Focus Mode.
          </p>
        </div>
        <Toggle
          id="start-in-focus-mode"
          checked={startInFocusMode}
          ariaLabel="Start Learn sessions in Focus Mode"
          onChange={setStartInFocusMode}
        />
      </div>
    </section>
  );
}

export function CourseDefaultsSection() {
  const [practiceDefaults, setPracticeDefaults] = usePracticeDefaults();
  const [autoOptimise, setAutoOptimise] = useAutoOptimiseDefault();
  const [afterFinalExam, setAfterFinalExam] = useAfterFinalExamPolicy();

  return (
    <section
      id="settings-course-defaults"
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <FlameIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl">
          Scheduling &amp; practice
        </SettingsSectionHeading>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Shared starting points for scheduling and automatic practice. A course&apos;s own settings
        always take priority.
      </p>
      <SettingToggle
        title="Auto-insert practice nodes"
        description="Automatically add practice nodes between lessons on the course path."
        checked={practiceDefaults.autoPractice}
        onChange={(checked) => setPracticeDefaults({ ...practiceDefaults, autoPractice: checked })}
      />

      <div className="mt-6 border-t border-line pt-5">
        <div className="text-sm">After the final exam</div>
        <p className="mt-1 text-sm text-ink-soft">
          Decide what happens after a course’s final exam. Checkpoints never trigger this.
        </p>
        <div className="mt-3 grid gap-2" role="radiogroup" aria-label="After the final exam">
          {FINAL_EXAM_POLICIES.map((policy) => (
            <button
              key={policy.value}
              type="button"
              role="radio"
              aria-checked={afterFinalExam === policy.value}
              onClick={() => setAfterFinalExam(policy.value)}
              className={cn(
                'rounded-xl border px-4 py-3 text-left transition-colors',
                afterFinalExam === policy.value
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <span className="block text-sm text-ink">{policy.label}</span>
              <span className="mt-0.5 block text-xs text-ink-soft">{policy.description}</span>
            </button>
          ))}
        </div>
      </div>

      <details className="group mt-6 border-t border-line pt-5">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Advanced scheduling</span>
            <span className="mt-1 block text-sm text-ink-soft">
              Lacuna uses its recommended scheduling model by default. Open this only if you want
              courses without their own override to fit scheduling to your review history.
            </span>
          </span>
          <ChevronDownIcon
            width={18}
            height={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-5 rounded-xl border border-line bg-surface-raised/50 p-4">
          <SettingToggle
            title="Optimise scheduling"
            description={`Fit each course's FSRS weights to your own review history. Optimisation starts only after at least ${MIN_OPTIMISE_REVIEWS} reviews, and new weights are never applied without your confirmation. You can override this per course in its settings.`}
            checked={autoOptimise}
            onChange={setAutoOptimise}
          />
        </div>
      </details>

      <details className="group mt-6 border-t border-line pt-5">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Advanced practice timing</span>
            <span className="mt-1 block text-sm text-ink-soft">
              Keep the recommended thresholds unless you need tighter control over when Lacuna
              inserts practice into a course path.
            </span>
          </span>
          <ChevronDownIcon
            width={18}
            height={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumberField
            label="Threshold (far)"
            value={practiceDefaults.practiceThresholdMinutesFar}
            suffix="min"
            min={1}
            max={999}
            onChange={(value) =>
              setPracticeDefaults({ ...practiceDefaults, practiceThresholdMinutesFar: value })
            }
          />
          <NumberField
            label="Threshold (near)"
            value={practiceDefaults.practiceThresholdMinutesNear}
            suffix="min"
            min={1}
            max={999}
            onChange={(value) =>
              setPracticeDefaults({ ...practiceDefaults, practiceThresholdMinutesNear: value })
            }
          />
          <NumberField
            label="Revision period"
            value={practiceDefaults.practiceUrgentWindowDays}
            suffix="days"
            min={0}
            max={365}
            onChange={(value) =>
              setPracticeDefaults({ ...practiceDefaults, practiceUrgentWindowDays: value })
            }
          />
          <NumberField
            label="Max gap"
            value={practiceDefaults.practiceMaxGap}
            suffix="lessons"
            min={1}
            max={99}
            onChange={(value) =>
              setPracticeDefaults({ ...practiceDefaults, practiceMaxGap: value })
            }
          />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          The near threshold applies once an exam is within the revision period; the far threshold
          applies otherwise. Max gap forces a practice node after this many lessons without one.
        </p>
      </details>
    </section>
  );
}

function SettingToggle({
  title,
  description,
  checked,
  onChange,
  bordered = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3',
        bordered && 'mt-6 border-t border-line pt-5',
      )}
    >
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} ariaLabel={title} />
    </div>
  );
}

function NumberField({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm text-ink-soft">
      {label}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) onChange(Math.max(min, Math.min(max, next)));
          }}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-accent"
        />
        <span className="shrink-0 text-xs text-ink-faint">{suffix}</span>
      </div>
    </label>
  );
}
