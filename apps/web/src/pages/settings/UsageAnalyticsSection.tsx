import {
  saveUsagePreference,
  usageAnalyticsAvailable,
  useUsagePreference,
  useUsagePrivacyBlocked,
} from '../../usage/preference';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { PillSwitch, SettingRow, SettingsCard } from './SettingsUi';

export function UsageAnalyticsSection() {
  if (!usageAnalyticsAvailable()) return null;
  return <UsageAnalyticsSetting />;
}

function UsageAnalyticsSetting() {
  const preference = useUsagePreference();
  const privacyBlocked = useUsagePrivacyBlocked();
  const unavailable = preference === 'unavailable';

  return (
    <SettingsCard id="settings-usage-analytics">
      <SettingRow
        label={
          <div data-usage-private="">
            <SettingsSectionHeading className="font-display text-xl text-ink">
              Usage analytics
            </SettingsSectionHeading>
            {privacyBlocked ? (
              <p className="mt-1 text-sm font-normal text-ink-soft">Off by browser preference</p>
            ) : unavailable ? (
              <p className="mt-1 text-sm font-normal text-ink-soft">Browser storage unavailable</p>
            ) : null}
          </div>
        }
        className="py-0"
      >
        <div data-usage-private="">
          <PillSwitch
            checked={preference === 'on' && !privacyBlocked}
            onChange={saveUsagePreference}
            ariaLabel="Usage analytics"
            disabled={privacyBlocked || unavailable}
          />
        </div>
      </SettingRow>
    </SettingsCard>
  );
}
