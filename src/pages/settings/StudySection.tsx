import { m as motion } from 'motion/react';
import { FlameIcon } from '../../components/ui/icons';
import { Toggle } from '../../components/ui/Toggle';
import { MIN_OPTIMISE_REVIEWS } from '../../fsrs/optimise';
import { useAnswerStrictness, type AnswerStrictness } from '../../state/answerStrictness';
import { useStartInFocusMode } from '../../state/focusModePreference';
import { useGradingMode } from '../../state/gradingMode';
import { useAutoOptimiseDefault } from '../../state/optimiseSetting';
import { usePracticeDefaults } from '../../state/practiceDefaults';
import { useTypingSetting } from '../../state/typingSetting';
import { cn } from '../../components/ui/cn';

export function StudySection({ motionMultiplier }: { motionMultiplier: number }) {
  const [gradingMode, setGradingMode] = useGradingMode();
  const [typingSetting, setTypingSetting] = useTypingSetting();
  const [answerStrictness, setAnswerStrictness] = useAnswerStrictness();
  const [autoOptimise, setAutoOptimise] = useAutoOptimiseDefault();
  const [practiceDefaults, setPracticeDefaults] = usePracticeDefaults();
  const [startInFocusMode, setStartInFocusMode] = useStartInFocusMode();

  return (
    <motion.section
      id="settings-study"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.25 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <FlameIcon width={18} height={18} />
        <h2 className="font-display text-xl">Study &amp; scheduling</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        How grades are decided and how the FSRS schedule adapts to you.
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

      {typingSetting === 'type' && (
        <div className="mt-5 flex items-center justify-between gap-3 pl-0">
          <div className="min-w-0">
            <div className="text-sm">Grading strictness</div>
            <p className="mt-1 text-sm text-ink-soft">
              How closely a typed answer must match. Lenient ignores case and punctuation,
              standard ignores case only, exact requires both to match.
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
          <label htmlFor="start-in-focus-mode" className="text-sm">Start Learn sessions in Focus Mode</label>
          <p className="mt-1 text-sm text-ink-soft">
            Hide session controls when Learn opens. Press Esc at any time to leave Focus Mode.
          </p>
        </div>
        <Toggle id="start-in-focus-mode" checked={startInFocusMode} onChange={setStartInFocusMode} />
      </div>

      <SettingToggle
        bordered
        title="Optimise scheduling"
        description={`Fit each course's FSRS weights to your own review history, which is where most of FSRS's efficiency comes from. On by default. Optimisation only runs once a course has at least ${MIN_OPTIMISE_REVIEWS} reviews, and new weights are never applied without your confirmation. You can override this per course in its settings.`}
        checked={autoOptimise}
        onChange={setAutoOptimise}
      />

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="font-display text-base">Course defaults</h3>
        <p className="mt-1 mb-4 text-sm text-ink-soft">
          Starting point for practice nodes on new courses. Any course can override these in its own settings, which always take priority.
        </p>
        <SettingToggle
          title="Auto-insert practice nodes"
          description="Automatically add practice nodes between lessons on the course path."
          checked={practiceDefaults.autoPractice}
          onChange={(checked) => setPracticeDefaults({ ...practiceDefaults, autoPractice: checked })}
        />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumberField label="Threshold (far)" value={practiceDefaults.practiceThresholdMinutesFar} suffix="min" min={1} max={999} onChange={(value) => setPracticeDefaults({ ...practiceDefaults, practiceThresholdMinutesFar: value })} />
          <NumberField label="Threshold (near)" value={practiceDefaults.practiceThresholdMinutesNear} suffix="min" min={1} max={999} onChange={(value) => setPracticeDefaults({ ...practiceDefaults, practiceThresholdMinutesNear: value })} />
          <NumberField label="Revision period" value={practiceDefaults.practiceUrgentWindowDays} suffix="days" min={0} max={365} onChange={(value) => setPracticeDefaults({ ...practiceDefaults, practiceUrgentWindowDays: value })} />
          <NumberField label="Max gap" value={practiceDefaults.practiceMaxGap} suffix="lessons" min={1} max={99} onChange={(value) => setPracticeDefaults({ ...practiceDefaults, practiceMaxGap: value })} />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          The near threshold applies once an exam is within the revision period; the far threshold applies otherwise. Max gap forces a practice node after this many lessons without one.
        </p>
      </div>
    </motion.section>
  );
}

function SettingToggle({ title, description, checked, onChange, bordered = false }: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  bordered?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', bordered && 'mt-6 border-t border-line pt-5')}>
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function NumberField({ label, value, suffix, min, max, onChange }: {
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
