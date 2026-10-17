import { fieldLabelClassName, inputFrameClassName } from '../ui/Field';
import { SectionCard } from '../ui/SectionCard';
import { Toggle } from '../ui/Toggle';
import { useId } from 'react';
import type { GeneratorDescription } from '../../questions/generators/contracts';

interface GeneratedQuestionConfigurationProps {
  generator: GeneratorDescription;
  configuration: Readonly<Record<string, string | number | boolean>>;
  onChange: (configuration: Record<string, string | number | boolean>) => void;
}

export function GeneratedQuestionConfiguration({
  generator,
  configuration,
  onChange,
}: GeneratedQuestionConfigurationProps) {
  const id = useId();
  const updateField = (key: string, value: number | boolean) => {
    onChange({ ...configuration, [key]: value });
  };

  return (
    <SectionCard>
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
        {generator.name}
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{generator.summary}</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {generator.configurationFields.map((field) =>
          field.kind === 'boolean' ? (
            <div
              key={field.key}
              className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-ink/[0.04] px-4"
            >
              <label htmlFor={`${id}-${field.key}`} className={fieldLabelClassName}>
                {field.label}
              </label>
              <Toggle
                id={`${id}-${field.key}`}
                checked={Boolean(configuration[field.key])}
                onChange={(checked) => updateField(field.key, checked)}
                ariaLabel={field.label}
              />
            </div>
          ) : (
            <label key={field.key} className="block">
              <span className={`${fieldLabelClassName} mb-2`}>{field.label}</span>
              <input
                type="number"
                min={field.minimum}
                max={field.maximum}
                step="1"
                value={Number(configuration[field.key])}
                onChange={(event) => updateField(field.key, Number(event.target.value))}
                className={`${inputFrameClassName} min-h-11 w-full`}
              />
            </label>
          ),
        )}
      </div>
    </SectionCard>
  );
}
