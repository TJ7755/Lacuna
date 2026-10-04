import { LayoutGroup, m as motion } from 'motion/react';
import { MoonIcon } from '../../components/ui/icons';
import { cn } from '../../components/ui/cn';
import { scaledSpring } from '../../components/ui/motion';
import { ACCENTS, useAccent } from '../../state/AccentContext';
import { FONT_SCALE_STEPS, useFontScale } from '../../state/FontScaleContext';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useTheme, type Theme } from '../../state/ThemeContext';
import { MotionSpeedControl } from './MotionSpeedControl';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { SegmentedPills, SETTINGS_HEADING_ROW_CLASS, SettingRow, SettingsCard } from './SettingsUi';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
];

export function AppearanceSection() {
  const [motionSpeed, setMotionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const { scale, setScale } = useFontScale();

  const scaleOptions = FONT_SCALE_STEPS.map((step) => ({
    value: step.label,
    ariaLabel: step.label,
    label: <span style={{ fontSize: `${step.value}em` }}>A</span>,
  }));
  const activeStep = FONT_SCALE_STEPS.find(
    (step) => Math.round(scale * 100) === Math.round(step.value * 100),
  );

  return (
    <SettingsCard id="settings-appearance">
      <div className={cn('mb-2', SETTINGS_HEADING_ROW_CLASS)}>
        <MoonIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Appearance
        </SettingsSectionHeading>
      </div>

      <SettingRow label="Theme">
        <SegmentedPills label="Theme" value={theme} options={THEME_OPTIONS} onChange={setTheme} />
      </SettingRow>

      <SettingRow label="Accent colour">
        <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2.5">
          <LayoutGroup id="accent-swatches">
            {ACCENTS.map((option) => {
              const active = accent === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAccent(option.key)}
                  title={option.label}
                  aria-label={option.label}
                  className="relative grid h-11 w-11 place-items-center rounded-full transition-transform duration-150 hover:scale-105 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <span
                    aria-hidden="true"
                    className="h-8 w-8 rounded-full"
                    style={{ backgroundColor: option.swatch }}
                  />
                  {active && (
                    <motion.span
                      layoutId="accent-ring"
                      aria-hidden="true"
                      transition={scaledSpring(multiplier, 520, 32)}
                      className="absolute inset-0.5 rounded-full ring-2 ring-ink"
                    />
                  )}
                </button>
              );
            })}
          </LayoutGroup>
        </div>
      </SettingRow>

      <SettingRow label="Text size">
        <SegmentedPills
          label="Text size"
          value={activeStep?.label ?? ''}
          options={scaleOptions}
          onChange={(label) => {
            const step = FONT_SCALE_STEPS.find((candidate) => candidate.label === label);
            if (step) setScale(step.value);
          }}
        />
      </SettingRow>

      <SettingRow label="Motion">
        <MotionSpeedControl value={motionSpeed} onChange={setMotionSpeed} />
      </SettingRow>
    </SettingsCard>
  );
}
