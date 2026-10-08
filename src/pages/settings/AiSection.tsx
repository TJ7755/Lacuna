import { fieldLabelClassName } from '../../components/ui/Field';
import { useAiSettings } from '../../ai/settings';
import { SparklesIcon } from '../../components/ui/icons';
import { useOptionalAiSession } from '../../ai/session/AiSessionContext';
import { AiMemoryInspector } from './AiMemoryInspector';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { PillSwitch, SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';
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

      <fieldset className="mb-6">
        <legend className={`mb-2 ${fieldLabelClassName}`}>AI connection</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['external', 'External AI client'],
              ['hosted', 'Built-in AI'],
            ] as const
          ).map(([provider, label]) => (
            <label
              key={provider}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${settings.provider === provider ? 'border-accent bg-accent/5 text-ink' : 'border-line text-ink-soft'}`}
            >
              <input
                type="radio"
                name="ai-provider"
                value={provider}
                checked={settings.provider === provider}
                onChange={() => update({ provider })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-ink">Enable AI</div>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            {settings.provider === 'hosted'
              ? 'Adds the built-in AI conversation to the sidebar. An access code is required.'
              : 'Adds desktop AI chat and short-code client pairing. Disabled by default and unavailable on mobile.'}
          </p>
        </div>
        <PillSwitch
          checked={settings.enabled}
          onChange={(enabled) => void setEnabled(enabled)}
          ariaLabel="Enable AI"
        />
      </div>

      <div className="mt-6 flex items-start justify-between gap-4 pt-0">
        <div className="min-w-0">
          <div className="text-sm text-ink">Use misconception-first teaching</div>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            Diagnoses an existing mental model before correcting it. Course actions stay local and
            require Lacuna&apos;s normal permission checks.
          </p>
        </div>
        <PillSwitch
          checked={settings.misconceptionFirstEnabled}
          onChange={(misconceptionFirstEnabled) => update({ misconceptionFirstEnabled })}
          ariaLabel="Use misconception-first teaching"
        />
      </div>

      <AiMemoryInspector />
    </SettingsCard>
  );
}
