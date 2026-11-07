import { ChartIcon } from '../../components/ui/icons';
import { useProductAnalyticsEnabled } from '../../state/productAnalytics';
import { installSimpleAnalytics, removeSimpleAnalytics } from '../../webBootstrap';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { PillSwitch, SETTINGS_HEADING_ROW_CLASS, SettingRow, SettingsCard } from './SettingsUi';
import { cn } from '../../components/ui/cn';

/**
 * The device-local anonymous product-counts switch (#1192). The same
 * preference backs the prominent onboarding step; changing it here applies
 * immediately to the hosted website analytics script on the next load.
 * Hosted web only: the switch never enables Electron, preview or development
 * collection, and Do Not Track stays respected while it is on.
 */
export function ProductAnalyticsSection() {
  const [enabled, setEnabled] = useProductAnalyticsEnabled();

  return (
    <SettingsCard id="settings-product-analytics">
      <div className={cn('mb-1', SETTINGS_HEADING_ROW_CLASS)}>
        <ChartIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Anonymous usage counts
        </SettingsSectionHeading>
      </div>
      <p className="mb-5 text-sm leading-6 text-ink-soft">
        Lacuna is local-first: study content stays on your device. On the hosted website only,
        anonymous counts help maintainers see whether onboarding and study sessions work. Counts use
        cookieless Simple Analytics custom events with the app version and a coarse touch or desktop
        band, and respect Do Not Track.
      </p>

      <SettingRow
        className="items-start"
        label={
          <>
            Count anonymous usage
            <span className="mt-1 block text-sm font-normal leading-6 text-ink-soft">
              {enabled
                ? 'On: app opens, onboarding completion, study sessions and error screens are counted.'
                : 'Off: the analytics script is removed and nothing is counted.'}
            </span>
          </>
        }
      >
        <PillSwitch
          checked={enabled}
          onChange={(checked) => {
            setEnabled(checked);
            try {
              if (checked) installSimpleAnalytics();
              else removeSimpleAnalytics();
            } catch {
              // The stored preference decides; a script failure never blocks study.
            }
          }}
          ariaLabel="Count anonymous usage"
        />
      </SettingRow>

      <p className="mt-3 text-sm text-ink-faint">
        Never counted: card content, answers, identifiers, account details, desktop app use, preview
        builds or development. See the privacy information for retention.
      </p>
    </SettingsCard>
  );
}
