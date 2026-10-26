import { InlineSettingsDisclosure } from './InlineSettingsDisclosure';
import { FlameIcon } from '../../components/ui/icons';
import { NumberField } from './NumberField';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { MIN_OPTIMISE_REVIEWS } from '../../fsrs/optimiseConfig';
import { useAnswerInput } from '../../state/answerInput';
import { useAnswerStrictness, type AnswerStrictness } from '../../state/answerStrictness';
import { useAdvancedDetails } from '../../state/advancedDetails';
import { useStartInFocusMode } from '../../state/focusModePreference';
import { useGradingMode } from '../../state/gradingMode';
import { useRecitationInput } from '../../state/recitationInput';
import { useAutoOptimiseDefault } from '../../state/optimiseSetting';
import { usePracticeDefaults } from '../../state/practiceDefaults';
import { cn } from '../../components/ui/cn';
import {
  AUDIO_PLAYBACK_SPEEDS,
  useAudioSettings,
  type AudioPlaybackSpeed,
} from '../../state/audioSettings';
import { useAfterFinalExamPolicy, type AfterFinalExamPolicy } from '../../state/finalExamLifecycle';
import { PillSwitch, SegmentedPills, SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';

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
  const [showAdvancedDetails, setShowAdvancedDetails] = useAdvancedDetails();
  const [answerInput, setAnswerInput] = useAnswerInput();
  const [gradingMode, setGradingMode] = useGradingMode();
  const [answerStrictness, setAnswerStrictness] = useAnswerStrictness();
  const [startInFocusMode, setStartInFocusMode] = useStartInFocusMode();
  const [audioSettings, setAudioSettings] = useAudioSettings();
  const [recitationInput, setRecitationInput] = useRecitationInput();

  return (
    <SettingsCard id="settings-study">
      <div className={cn('mb-5', SETTINGS_HEADING_ROW_CLASS)}>
        <FlameIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Session behaviour
        </SettingsSectionHeading>
      </div>

      <SettingToggle
        title="Show advanced details"
        description="Show scheduler settings and technical statistics. Your study schedule stays the same."
        checked={showAdvancedDetails}
        onChange={setShowAdvancedDetails}
      />

      <SettingToggle
        bordered
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
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <div className="font-semibold text-ink">Audio playback speed</div>
        </div>
        <SegmentedPills
          label="Audio playback speed"
          value={String(audioSettings.playbackSpeed)}
          options={AUDIO_PLAYBACK_SPEEDS.map((speed) => ({
            value: String(speed),
            label: `${speed}×`,
          }))}
          onChange={(speed) =>
            setAudioSettings({
              ...audioSettings,
              playbackSpeed: Number(speed) as AudioPlaybackSpeed,
            })
          }
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="font-semibold text-ink">Answer cards by</div>
          <p className="mt-1 text-sm text-ink-soft">
            When Jev is on, typed answers are marked automatically.
          </p>
        </div>
        <SegmentedPills
          label="Answer cards by"
          value={answerInput}
          options={[
            { value: 'course', label: 'As the course suggests' },
            { value: 'type', label: 'Typing where possible' },
            { value: 'reveal', label: 'Revealing' },
          ]}
          onChange={setAnswerInput}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="font-semibold text-ink">Grading strictness</div>
          <p className="mt-1 text-sm text-ink-soft">
            How closely a typed answer must match. Lenient ignores case and punctuation, standard
            ignores case only, exact requires both to match.
          </p>
        </div>
        <SegmentedPills
          label="Grading strictness"
          value={answerStrictness}
          options={(['lenient', 'standard', 'exact'] as AnswerStrictness[]).map((level) => ({
            value: level,
            label: <span className="capitalize">{level}</span>,
          }))}
          onChange={setAnswerStrictness}
        />
      </div>

      <SettingToggle
        bordered
        title="Recite poems and scripts aloud"
        description="Off: type each line from memory. On: say the lines aloud, then reveal them and mark any you got wrong."
        checked={recitationInput === 'aloud'}
        onChange={(checked) => setRecitationInput(checked ? 'aloud' : 'type')}
      />

      <div className="mt-6 flex items-start justify-between gap-3 pt-0">
        <div className="min-w-0">
          <label htmlFor="start-in-focus-mode" className="font-semibold text-ink">
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
  const [showAdvancedDetails] = useAdvancedDetails();
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
        title={showAdvancedDetails ? 'Auto-insert practice nodes' : 'Add practice between lessons'}
        checked={practiceDefaults.autoPractice}
        onChange={(checked) => setPracticeDefaults({ ...practiceDefaults, autoPractice: checked })}
      />

      <div className="mt-6 pt-0">
        <div className="font-semibold text-ink">After the final exam</div>
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

      {showAdvancedDetails && (
        <InlineSettingsDisclosure
          className="group mt-6 pt-0"
          headerClassName="flex cursor-pointer items-start justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          header={
            <>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">Advanced scheduling</span>
                <span className="mt-1 block text-sm text-ink-soft">
                  Fit default scheduling to your review history.
                </span>
              </span>
            </>
          }
        >
          <div className="mt-5 rounded-2xl bg-ink/[0.04] p-4">
            <SettingToggle
              title="Optimise scheduling"
              description={`Fits FSRS weights after ${MIN_OPTIMISE_REVIEWS} reviews. Changes require confirmation and can be overridden per course.`}
              checked={autoOptimise}
              onChange={setAutoOptimise}
            />
          </div>
        </InlineSettingsDisclosure>
      )}

      {showAdvancedDetails && (
        <InlineSettingsDisclosure
          className="group mt-6 pt-0"
          headerClassName="flex cursor-pointer items-start justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          header={
            <>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">Advanced practice timing</span>
                <span className="mt-1 block text-sm text-ink-soft">
                  Adjust when practice nodes appear on course paths.
                </span>
              </span>
            </>
          }
        >
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumberField
              label="Threshold (far)"
              value={practiceDefaults.practiceThresholdMinutesFar}
              suffix="min"
              min={1}
              max={999}
              onCommit={(value) =>
                setPracticeDefaults({
                  ...practiceDefaults,
                  practiceThresholdMinutesFar: value,
                })
              }
            />
            <NumberField
              label="Threshold (near)"
              value={practiceDefaults.practiceThresholdMinutesNear}
              suffix="min"
              min={1}
              max={999}
              onCommit={(value) =>
                setPracticeDefaults({
                  ...practiceDefaults,
                  practiceThresholdMinutesNear: value,
                })
              }
            />
            <NumberField
              label="Revision period"
              value={practiceDefaults.practiceUrgentWindowDays}
              suffix="days"
              min={0}
              max={365}
              onCommit={(value) =>
                setPracticeDefaults({
                  ...practiceDefaults,
                  practiceUrgentWindowDays: value,
                })
              }
            />
            <NumberField
              label="Max gap"
              value={practiceDefaults.practiceMaxGap}
              suffix="lessons"
              min={1}
              max={99}
              onCommit={(value) =>
                setPracticeDefaults({
                  ...practiceDefaults,
                  practiceMaxGap: value,
                })
              }
            />
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            The near threshold applies once an exam is within the revision period; the far threshold
            applies otherwise. Max gap forces a practice node after this many lessons without one.
          </p>
        </InlineSettingsDisclosure>
      )}
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
        <div className="font-semibold text-ink">{title}</div>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      <PillSwitch checked={checked} onChange={onChange} ariaLabel={title} />
    </div>
  );
}
