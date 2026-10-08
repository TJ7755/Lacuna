// Hero of the Your data area: the one big Back up action and how fresh the last
// backup is. The button runs busy -> tick, and a short burst marks a saved backup.

import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { Burst } from '../../components/ui/Celebration';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { ArchiveIcon, CheckIcon } from '../../components/ui/icons';
import { scaledSpring } from '../../components/ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { backupStatus, type BackupStatus } from './backupStatus';
import { SettingsCard } from './SettingsUi';
import { SettingsSectionHeading } from './SettingsSectionHeading';

type Phase = 'idle' | 'busy' | 'done';

/** How long the busy state shows at least, so a fast save still registers. */
const MIN_BUSY_MS = 450;
const DONE_MS = 2400;

export const BackupHero = forwardRef<
  HTMLButtonElement,
  {
    /** Time of the newest restore point, if there is one. */
    lastAt: number | null;
    /** Saves a restore point; resolves true when it was saved. */
    onBackUp: () => Promise<boolean>;
    children?: ReactNode;
  }
>(function BackupHero({ lastAt, onBackUp, children }, ref) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const [phase, setPhase] = useState<Phase>('idle');
  const [bursts, setBursts] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleClick() {
    if (phase === 'busy') return;
    setPhase('busy');
    const hold = new Promise((resolve) => window.setTimeout(resolve, MIN_BUSY_MS * multiplier));
    const [saved] = await Promise.all([onBackUp(), hold]);
    if (!saved) {
      setPhase('idle');
      return;
    }
    setPhase('done');
    setBursts((count) => count + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPhase('idle'), DONE_MS);
  }

  const status: BackupStatus =
    phase === 'done' ? { label: 'Backed up just now', tone: 'fresh' } : backupStatus(lastAt);

  return (
    <SettingsCard id="settings-backups">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink"
        >
          <ArchiveIcon width={24} height={24} />
        </span>
        <div className="min-w-0 flex-1 basis-60">
          <SettingsSectionHeading className="font-display text-2xl font-semibold tracking-tight">
            Everything lives on this device
          </SettingsSectionHeading>
          <p
            aria-live="polite"
            className={cn(
              'mt-1 flex items-center gap-2 text-sm font-semibold',
              status.tone === 'fresh' ? 'text-positive' : 'text-warning-fg',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'h-2 w-2 rounded-full',
                status.tone === 'fresh' ? 'bg-positive' : 'bg-warning',
              )}
            />
            {status.label}
          </p>
        </div>
        <div className="relative">
          <Button
            ref={ref}
            variant="primary"
            size="lg"
            onClick={() => void handleClick()}
            disabled={phase === 'busy'}
            aria-busy={phase === 'busy'}
            className="min-h-14 px-8"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center">
              {phase === 'done' ? (
                <motion.span
                  key={bursts}
                  initial={multiplier > 0 ? { scale: 0, rotate: -30 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={scaledSpring(multiplier, 520, 16)}
                  className="inline-flex"
                >
                  <CheckIcon width={20} height={20} />
                </motion.span>
              ) : (
                <ArchiveIcon
                  width={20}
                  height={20}
                  className={phase === 'busy' && multiplier > 0 ? 'animate-pulse' : undefined}
                />
              )}
            </span>
            {phase === 'busy' ? 'Backing up…' : phase === 'done' ? 'Backed up' : 'Back up'}
          </Button>
          {bursts > 0 && phase === 'done' && (
            <Burst trigger={bursts} multiplier={multiplier} count={14} spread={70} />
          )}
        </div>
      </div>
      {children && <div className="mt-6 flex flex-col gap-3">{children}</div>}
    </SettingsCard>
  );
});
