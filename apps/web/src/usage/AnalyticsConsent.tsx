import { useId, useLayoutEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { SegmentedPills } from '../components/ui/SegmentedPills';
import { SettingsModal } from '../pages/settings/SettingsModal';
import {
  saveUsagePreference,
  usageAnalyticsAvailable,
  useUsagePreference,
  useUsagePrivacyBlocked,
} from './preference';

const CHOICES = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const;

export function AnalyticsConsent() {
  if (!usageAnalyticsAvailable()) return null;
  return <UsageChoice />;
}

function UsageChoice() {
  const preference = useUsagePreference();
  const privacyBlocked = useUsagePrivacyBlocked();
  const [choice, setChoice] = useState<'on' | 'off'>('on');
  const titleId = useId();
  const open = preference === 'unset';

  useLayoutEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    if (!root) return;
    const previousInert = root.inert;
    root.inert = true;
    return () => {
      root.inert = previousInert;
    };
  }, [open]);

  return (
    <SettingsModal open={open} labelledBy={titleId} onClose={() => saveUsagePreference(false)}>
      <form
        data-usage-private=""
        onSubmit={(event) => {
          event.preventDefault();
          saveUsagePreference(choice === 'on');
        }}
      >
        <h2 id={titleId} className="font-display text-xl text-ink">
          Usage analytics
        </h2>
        {privacyBlocked ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Your browser’s privacy signal keeps analytics off.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Share counts and timings about pages and controls to help improve Lacuna. Your browser
              remembers this choice. Analytics uses no cookies or study content.
            </p>
            <div className="mt-5">
              <SegmentedPills
                label="Usage analytics choice"
                options={CHOICES}
                value={choice}
                onChange={setChoice}
              />
            </div>
          </>
        )}
        <p className="mt-5 text-sm leading-relaxed text-ink-soft">
          Continue saves your choice. You can change it in Settings.
        </p>
        <div className="mt-5 flex justify-end">
          <Button type="submit" variant="primary">
            Continue
          </Button>
        </div>
      </form>
    </SettingsModal>
  );
}
