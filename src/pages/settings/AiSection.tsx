import { useAiSettings } from '../../ai/settings';
import { SparklesIcon } from '../../components/ui/icons';
import { Toggle } from '../../components/ui/Toggle';

export function AiSection() {
  const [settings, update] = useAiSettings();

  return (
    <section id="settings-ai" className="mb-8 rounded-2xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center gap-2 text-accent">
        <SparklesIcon width={18} height={18} />
        <h2 className="font-display text-xl">AI</h2>
      </div>
      <p className="mb-5 text-sm leading-6 text-ink-soft">
        Pair a running terminal AI with Lacuna using an encrypted relay. Lacuna stores no model
        credentials and does not choose the model or terminal harness.
      </p>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-ink">Enable AI</div>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            Adds desktop AI chat and short-code terminal pairing. Disabled by default and
            unavailable on mobile.
          </p>
        </div>
        <Toggle
          checked={settings.enabled}
          onChange={(enabled) => update({ enabled })}
          ariaLabel="Enable AI"
        />
      </div>

      <div className="mt-6 flex items-start justify-between gap-4 border-t border-line pt-5">
        <div className="min-w-0">
          <div className="text-sm text-ink">Use misconception-first teaching</div>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            Saves your preference for the planned teaching workflow. Memory and course or Card
            actions are not connected to AI chat yet.
          </p>
        </div>
        <Toggle
          checked={settings.misconceptionFirstEnabled}
          onChange={(misconceptionFirstEnabled) => update({ misconceptionFirstEnabled })}
          ariaLabel="Use misconception-first teaching"
        />
      </div>
    </section>
  );
}
