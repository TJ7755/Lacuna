import { m as motion } from 'motion/react';
import { MoonIcon, SunIcon } from '../../components/ui/icons';
import { cn } from '../../components/ui/cn';
import { ACCENTS, useAccent } from '../../state/AccentContext';
import { FONT_SCALE_STEPS, useFontScale } from '../../state/FontScaleContext';
import { useMotionSpeed, type MotionSpeed } from '../../state/motionSpeed';
import { useTheme, type Theme } from '../../state/ThemeContext';

export function AppearanceSection({ motionMultiplier }: { motionMultiplier: number }) {
  const [motionSpeed, setMotionSpeed] = useMotionSpeed();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const { scale, setScale } = useFontScale();

  return (
    <motion.section
      id="settings-appearance"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.05 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <MoonIcon width={18} height={18} />
        <h2 className="font-display text-xl">Appearance</h2>
      </div>
      <p className="mb-4 text-sm text-ink-soft">
        Lacuna defaults to a dark theme. Your choice is remembered on this device.
      </p>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm">
          {resolvedTheme === 'dark' ? <MoonIcon width={18} height={18} /> : <SunIcon width={18} height={18} />}
          {theme === 'auto'
            ? `Auto (${resolvedTheme === 'dark' ? 'dark' : 'light'})`
            : resolvedTheme === 'dark' ? 'Dark mode' : 'Light mode'}
        </span>
        <div className="flex gap-1">
          {(['dark', 'light', 'auto'] as Theme[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                theme === value
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              {value === 'dark' && 'Dark'}
              {value === 'light' && 'Light'}
              {value === 'auto' && 'Auto'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <div className="mb-1 text-sm">Accent colour</div>
        <p className="mb-3 text-sm text-ink-soft">
          Sets the highlight colour used across the app. Remembered on this device.
        </p>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((option) => {
            const active = accent === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setAccent(option.key)}
                aria-pressed={active}
                title={option.label}
                aria-label={option.label}
                className="relative h-9 w-9 rounded-full transition-transform duration-150 hover:scale-110 active:scale-[0.88]"
                style={{ backgroundColor: option.swatch }}
              >
                {active && <span className="absolute inset-[-4px] rounded-full ring-2 ring-ink ring-offset-2 ring-offset-surface" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm">Text size</span>
          <span className="tabular text-sm text-ink-faint">{Math.round(scale * 100)}%</span>
        </div>
        <p className="mb-3 text-sm text-ink-soft">
          Scales all text across the app. Remembered on this device.
        </p>
        <div className="flex gap-2">
          {FONT_SCALE_STEPS.map((step) => {
            const active = Math.round(scale * 100) === Math.round(step.value * 100);
            return (
              <button
                key={step.label}
                type="button"
                onClick={() => setScale(step.value)}
                aria-pressed={active}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-ink-soft hover:border-line-strong',
                )}
              >
                <span style={{ fontSize: `${step.value}em` }}>A</span>
                <span className="ml-1.5 align-middle text-xs">{step.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm">Animation speed</span>
          <span className="tabular text-sm text-ink-faint">
            {motionSpeed === 'slow' ? 'Slow' : motionSpeed === 'fast' ? 'Fast' : 'Normal'}
          </span>
        </div>
        <p className="mb-3 text-sm text-ink-soft">
          Adjust how quickly decorative animations play across the app. Does not affect functional timers or progress bars.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-faint">Slow</span>
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={motionSpeed === 'slow' ? 0 : motionSpeed === 'normal' ? 1 : 2}
            onChange={(event) => {
              const value = Number(event.target.value);
              const next: MotionSpeed = value === 0 ? 'slow' : value === 2 ? 'fast' : 'normal';
              setMotionSpeed(next);
            }}
            className="flex-1 accent-accent"
            aria-label="Animation speed"
          />
          <span className="text-xs text-ink-faint">Fast</span>
        </div>
      </div>
    </motion.section>
  );
}
