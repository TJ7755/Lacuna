import type { GeneratorDescription } from '../../questions/generators/contracts';

interface GeneratedQuestionConfigurationProps {
  generator: GeneratorDescription;
  configuration: Readonly<Record<string, string | number | boolean>>;
  onChange: (configuration: Record<string, string | number | boolean>) => void;
}

const inputClass =
  'min-h-12 w-full rounded-[14px] border-[1.5px] border-line-strong bg-surface px-4 py-2.5 text-ink outline-none transition focus:border-ink';

export function GeneratedQuestionConfiguration({
  generator,
  configuration,
  onChange,
}: GeneratedQuestionConfigurationProps) {
  const updateField = (key: string, value: number | boolean) => {
    onChange({ ...configuration, [key]: value });
  };

  return (
    <section className="rounded-3xl bg-surface p-6 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] md:p-7">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{generator.name}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{generator.summary}</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {generator.configurationFields.map((field) =>
          field.kind === 'boolean' ? (
            <label
              key={field.key}
              className="flex min-h-12 items-center gap-3 rounded-[14px] bg-ink/[0.04] px-4"
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
              <span className="mb-2 block text-[13px] font-bold text-ink-soft">
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
