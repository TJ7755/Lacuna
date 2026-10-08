import { ChevronDownIcon, FlameIcon } from '../../components/ui/icons';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { MIN_OPTIMISE_REVIEWS } from '../../fsrs/optimiseConfig';
import { useAnswerStrictness, type AnswerStrictness } from '../../state/answerStrictness';
import { useStartInFocusMode } from '../../state/focusModePreference';
import { useGradingMode } from '../../state/gradingMode';
import { useAutoOptimiseDefault } from '../../state/optimiseSetting';
import { usePracticeDefaults } from '../../state/practiceDefaults';
import { cn } from '../../components/ui/cn';
import { AUDIO_PLAYBACK_SPEEDS, useAudioSettings } from '../../state/audioSettings';
import { useAfterFinalExamPolicy, type AfterFinalExamPolicy } from '../../state/finalExamLifecycle';
import {
  choiceChipClass,
  PillSwitch,
  SETTINGS_HEADING_ROW_CLASS,
  SettingsCard,
} from './SettingsUi';

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
  const [answerStrictness, setAnswerStrictness] = useAnswerStrictness();
  const [startInFocusMode, setStartInFocusMode] = useStartInFocusMode();
  const [audioSettings, setAudioSettings] = useAudioSettings();

  return (
    <SettingsCard id="settings-study">
      <div className={cn('mb-5', SETTINGS_HEADING_ROW_CLASS)}>
        <FlameIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Session behaviour
        </SettingsSectionHeading>
      </div>

      <SettingToggle
        title="Manual four-point grading"
        description="Off: Lacuna infers a grade from correctness and response time. On: choose Again, Hard, Good or Easy."
        checked={gradingMode === 'manual'}
        onChange={(checked) => setGradingMode(checked ? 'manual' : 'silent')}
      />

      <SettingToggle
        bordered
        title="Autoplay audio cards"
        description="Your browser may require you to start the first clip manually."
        checked={audioSettings.autoplay}
        onChange={(autoplay) => setAudioSettings({ ...audioSettings, autoplay })}
      />
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm">Audio playback speed</div>
        </div>
        <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="Audio playback speed">
          {AUDIO_PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              role="radio"
              aria-checked={audioSettings.playbackSpeed === speed}
              onClick={() => setAudioSettings({ ...audioSettings, playbackSpeed: speed })}
              className={choiceChipClass(audioSettings.playbackSpeed === speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

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
              className={cn(choiceChipClass(answerStrictness === level), 'capitalize')}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-start justify-between gap-3 pt-0">
        <div className="min-w-0">
          <label htmlFor="start-in-focus-mode" className="text-sm">
            Start Learn sessions in focus mode
          </label>
          <p className="mt-1 text-sm text-ink-soft">
            Hides session controls on open. Press Esc to leave.
          </p>
        </div>
        <PillSwitch
          id="start-in-focus-mode"
          checked={startInFocusMode}
          ariaLabel="Start Learn sessions in focus mode"
          onChange={setStartInFocusMode}
        />
      </div>
    </SettingsCard>
  );
}

export function CourseDefaultsSection() {
  const [practiceDefaults, setPracticeDefaults] = usePracticeDefaults();
  const [autoOptimise, setAutoOptimise] = useAutoOptimiseDefault();
  const [afterFinalExam, setAfterFinalExam] = useAfterFinalExamPolicy();

  return (
    <SettingsCard id="settings-course-defaults">
      <div className={cn('mb-5', SETTINGS_HEADING_ROW_CLASS)}>
        <FlameIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Scheduling &amp; practice
        </SettingsSectionHeading>
      </div>
      <SettingToggle
        title="Auto-insert practice nodes"
        checked={practiceDefaults.autoPractice}
        onChange={(checked) => setPracticeDefaults({ ...practiceDefaults, autoPractice: checked })}
      />

      <div className="mt-6 pt-0">
        <div className="text-sm">After the final exam</div>
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

      <details className="group mt-6 pt-0">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Advanced scheduling</span>
            <span className="mt-1 block text-sm text-ink-soft">
              Fit default scheduling to your review history.
            </span>
          </span>
          <ChevronDownIcon
            width={18}
            height={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-5 rounded-2xl bg-ink/[0.04] p-4">
          <SettingToggle
            title="Optimise scheduling"
            description={`Fits FSRS weights after ${MIN_OPTIMISE_REVIEWS} reviews. Changes require confirmation and can be overridden per course.`}
            checked={autoOptimise}
            onChange={setAutoOptimise}
          />
        </div>
      </details>

      <details className="group mt-6 pt-0">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Advanced practice timing</span>
            <span className="mt-1 block text-sm text-ink-soft">
              Adjust when practice nodes appear on course paths.
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
    </SettingsCard>
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
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  bordered?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', bordered && 'mt-6 pt-0')}>
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      <PillSwitch checked={checked} onChange={onChange} ariaLabel={title} />
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
