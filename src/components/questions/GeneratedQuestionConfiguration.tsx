import type { GeneratorDescription } from '../../questions/generators/contracts';

interface GeneratedQuestionConfigurationProps {
  generator: GeneratorDescription;
  configuration: Readonly<Record<string, string | number | boolean>>;
  onChange: (configuration: Record<string, string | number | boolean>) => void;
}

const inputClass =
  'min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export function GeneratedQuestionConfiguration({
  generator,
  configuration,
  onChange,
}: GeneratedQuestionConfigurationProps) {
  const updateField = (key: string, value: number | boolean) => {
    onChange({ ...configuration, [key]: value });
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
      <p className="text-xs uppercase tracking-[0.14em] text-ink-faint">Built-in family</p>
      <h2 className="mt-2 font-display text-2xl text-ink">{generator.name}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{generator.summary}</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {generator.configurationFields.map((field) =>
          field.kind === 'boolean' ? (
            <label
              key={field.key}
              className="flex min-h-11 items-center gap-3 rounded-xl border border-line-strong px-4"
            >
              <input
                type="checkbox"
                checked={Boolean(configuration[field.key])}
                onChange={(event) => updateField(field.key, event.target.checked)}
                className="accent-accent"
              />
              <span className="text-sm text-ink">{field.label}</span>
            </label>
          ) : (
            <label key={field.key} className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
                {field.label}
              </span>
              <input
                type="number"
                min={field.minimum}
                max={field.maximum}
                step="1"
                value={Number(configuration[field.key])}
                onChange={(event) => updateField(field.key, Number(event.target.value))}
                className={inputClass}
              />
            </label>
          ),
        )}
      </div>
    </section>
  );
}
