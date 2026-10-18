import { fieldLabelClassName, inputFrameClassName } from '../ui/Field';
import { SectionCard } from '../ui/SectionCard';
import { Toggle } from '../ui/Toggle';
import { FieldError } from './QuestionMetadataFields';
import { useId, type Ref } from 'react';
import type { GeneratorDescription } from '../../questions/generators/contracts';

interface GeneratedQuestionConfigurationProps {
  ref?: Ref<HTMLElement>;
  generator: GeneratorDescription;
  configuration: Readonly<Record<string, string | number | boolean>>;
  onChange: (configuration: Record<string, string | number | boolean>) => void;
  errors?: Readonly<Record<string, string>>;
}

export function GeneratedQuestionConfiguration({
  ref,
  generator,
  configuration,
  onChange,
  errors = {},
}: GeneratedQuestionConfigurationProps) {
  const id = useId();
  const updateField = (key: string, value: number | boolean) => {
    onChange({ ...configuration, [key]: value });
  };

  return (
    <SectionCard ref={ref}>
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
            <div key={field.key}>
              <label htmlFor={`${id}-${field.key}`} className={`${fieldLabelClassName} mb-2`}>
                {field.label}
              </label>
              <input
                id={`${id}-${field.key}`}
                name={field.key}
                type="number"
                min={field.minimum}
                max={field.maximum}
                step="1"
                value={Number(configuration[field.key])}
                onChange={(event) => updateField(field.key, Number(event.target.value))}
                className={`${inputFrameClassName} min-h-11 w-full aria-[invalid=true]:border-negative`}
                aria-invalid={errors[field.key] ? true : undefined}
                aria-describedby={errors[field.key] ? `${id}-${field.key}-error` : undefined}
              />
              <FieldError id={`${id}-${field.key}-error`} message={errors[field.key]} />
            </div>
          ),
        )}
      </div>
    </SectionCard>
  );
}
