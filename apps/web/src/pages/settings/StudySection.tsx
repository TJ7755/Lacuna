import { useId } from 'react';
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

const STRICTNESS_DESCRIPTIONS: Record<AnswerStrictness, string> = {
  lenient: 'Ignores case and punctuation.',
  standard: 'Ignores case. Matches punctuation.',
  exact: 'Matches case and punctuation.',
};

const FINAL_EXAM_POLICIES: Array<{ value: AfterFinalExamPolicy; label: string }> = [
  { value: 'ask', label: 'Ask me' },
  { value: 'archive', label: 'Archive automatically' },
  { value: 'keep-revising', label: 'Keep revising' },
];

export function StudySection() {
  const [showAdvancedDetails, setShowAdvancedDetails] = useAdvancedDetails();
  const [answerInput, setAnswerInput] = useAnswerInput();
  const [gradingMode, setGradingMode] = useGradingMode();
  const [answerStrictness, setAnswerStrictness] = useAnswerStrictness();
  const strictnessDescriptionId = useId();
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
        checked={showAdvancedDetails}
        onChange={setShowAdvancedDetails}
      />

      <SettingToggle
        bordered
        title="Manual four-point grading"
        checked={gradingMode === 'manual'}
        onChange={(checked) => setGradingMode(checked ? 'manual' : 'silent')}
      />

      <SettingToggle
        bordered
        title="Autoplay audio cards"
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
          <p id={strictnessDescriptionId} className="mt-1 text-sm text-ink-soft">
            {STRICTNESS_DESCRIPTIONS[answerStrictness]}
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
          describedBy={strictnessDescriptionId}
        />
      </div>

      <SettingToggle
        bordered
        title="Recite poems and scripts aloud"
        checked={recitationInput === 'aloud'}
        onChange={(checked) => setRecitationInput(checked ? 'aloud' : 'type')}
      />

      <div className="mt-6 flex items-center justify-between gap-3">
        <label htmlFor="start-in-focus-mode" className="min-w-0 font-semibold text-ink">
          Start Learn sessions in focus mode
        </label>
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
        <SegmentedPills
          label="After the final exam"
          size="sm"
          value={afterFinalExam}
          options={FINAL_EXAM_POLICIES}
          onChange={setAfterFinalExam}
          className="mt-3 w-fit max-w-full"
        />
      </div>

      {showAdvancedDetails && (
        <InlineSettingsDisclosure
          className="group mt-6 pt-0"
          headerClassName="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          header={<span className="text-sm font-medium text-ink">Advanced scheduling</span>}
        >
          <div className="mt-5 rounded-2xl bg-ink/[0.04] p-4">
            <SettingToggle
              title="Optimise scheduling"
              description={`Available after ${MIN_OPTIMISE_REVIEWS} reviews.`}
              checked={autoOptimise}
              onChange={setAutoOptimise}
            />
          </div>
        </InlineSettingsDisclosure>
      )}

      {showAdvancedDetails && (
        <InlineSettingsDisclosure
          className="group mt-6 pt-0"
          headerClassName="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          header={<span className="text-sm font-medium text-ink">Advanced practice timing</span>}
        >
          <div className="mt-5 grid grid-cols-2 items-end gap-4 sm:grid-cols-4">
            <NumberField
              label="Backlog before revision period"
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
              label="Backlog during revision period"
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
              ariaLabel="Revision period (days before exam)"
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
              label="Maximum lesson gap"
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
    <div className={cn('flex items-center justify-between gap-3', bordered && 'mt-6')}>
      <div className="min-w-0">
        <div className="font-semibold text-ink">{title}</div>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      <PillSwitch checked={checked} onChange={onChange} ariaLabel={title} />
    </div>
  );
}
