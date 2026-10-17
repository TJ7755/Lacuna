import { useAiSettings } from '../../ai/settings';
import { SparklesIcon } from '../../components/ui/icons';
import { useOptionalAiSession } from '../../ai/session/AiSessionContext';
import { AiMemoryInspector } from './AiMemoryInspector';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import {
  PillSwitch,
  SegmentedPills,
  SETTINGS_HEADING_ROW_CLASS,
  SettingRow,
  SettingsCard,
} from './SettingsUi';
import { cn } from '../../components/ui/cn';

export function AiSection() {
  const [settings, update] = useAiSettings();
  const session = useOptionalAiSession();

  async function setEnabled(enabled: boolean): Promise<void> {
    if (!enabled) await session?.resetConnection();
    update({ enabled });
  }

  return (
    <SettingsCard id="settings-ai">
      <div className={cn('mb-1', SETTINGS_HEADING_ROW_CLASS)}>
        <SparklesIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          AI
        </SettingsSectionHeading>
      </div>
      <p className="mb-5 text-sm leading-6 text-ink-soft">
        {settings.provider === 'hosted'
          ? 'Built-in AI sends the messages and local content you choose to an external model. Study data and action approvals stay on this device.'
          : 'Pair a running AI client with Lacuna using an encrypted relay. Lacuna stores no model credentials and does not choose the model or client.'}
      </p>

      <SettingRow label="AI connection">
        <SegmentedPills
          label="AI connection"
          value={settings.provider}
          options={[
            { value: 'external', label: 'External AI client' },
            { value: 'hosted', label: 'Built-in AI' },
          ]}
          onChange={(provider) => update({ provider })}
        />
      </SettingRow>

      <SettingRow
        className="items-start"
        label={
          <>
            Enable AI
            <span className="mt-1 block text-sm font-normal leading-6 text-ink-soft">
              {settings.provider === 'hosted'
                ? 'Adds the built-in AI conversation to the sidebar. An access code is required.'
                : 'Adds desktop AI chat and short-code client pairing. Disabled by default and unavailable on mobile.'}
            </span>
          </>
        }
      >
        <PillSwitch
          checked={settings.enabled}
          onChange={(enabled) => void setEnabled(enabled)}
          ariaLabel="Enable AI"
        />
      </SettingRow>

      <SettingRow
        className="items-start"
        label={
          <>
            Use misconception-first teaching
            <span className="mt-1 block text-sm font-normal leading-6 text-ink-soft">
              Diagnoses an existing mental model before correcting it. Course actions stay local and
              require Lacuna&apos;s normal permission checks.
            </span>
          </>
        }
      >
        <PillSwitch
          checked={settings.misconceptionFirstEnabled}
          onChange={(misconceptionFirstEnabled) => update({ misconceptionFirstEnabled })}
          ariaLabel="Use misconception-first teaching"
        />
      </SettingRow>

      <AiMemoryInspector />
    </SettingsCard>
  );
}
