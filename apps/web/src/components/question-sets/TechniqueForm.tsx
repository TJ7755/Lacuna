import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  TECHNIQUE_NAME_MAX,
  TECHNIQUE_TEXT_MAX,
  type CourseTechnique,
} from '@lacuna/core/questions/techniqueTags';
import { CourseTechniqueError, type CourseTechniqueInput } from '../../questions/courseTechniques';
import { Button } from '../ui/Button';
import './question-techniques.css';

/**
 * Create or edit one course technique. Only the name is required; the description says what
 * a full-mark answer does and is what Jev reads, so it is offered without being demanded.
 */
export function TechniqueForm({
  initial,
  submitLabel,
  compact = false,
  onSubmit,
  onCancel,
}: {
  initial?: Pick<CourseTechnique, 'name' | 'description' | 'example'>;
  submitLabel: string;
  /** The inline card asks for less and labels by placeholder; the example stays in settings. */
  compact?: boolean;
  onSubmit: (input: CourseTechniqueInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [example, setExample] = useState(initial?.example ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  // Opened at the foot of a scrolling card or list, the whole form, actions included, comes
  // into view rather than only the focused name field.
  useEffect(() => {
    form.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!name.trim()) {
      setError('Give the technique a name.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name, description, ...(compact ? {} : { example }) });
    } catch (caught) {
      setError(
        caught instanceof CourseTechniqueError ? caught.message : 'The technique was not saved.',
      );
      setSaving(false);
    }
  };
  return (
    <form ref={form} className="qs-technique-form" onSubmit={submit} noValidate>
      <label htmlFor={`${id}-name`} className={compact ? 'sr-only' : undefined}>
        Name
      </label>
      <input
        id={`${id}-name`}
        value={name}
        maxLength={TECHNIQUE_NAME_MAX}
        autoComplete="off"
        placeholder={compact ? 'Name' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          setName(event.target.value);
          setError('');
        }}
        autoFocus
      />
      <label htmlFor={`${id}-description`} className={compact ? 'sr-only' : undefined}>
        Description
      </label>
      <textarea
        id={`${id}-description`}
        rows={2}
        value={description}
        maxLength={TECHNIQUE_TEXT_MAX}
        placeholder="What a full-mark answer does"
        onChange={(event) => setDescription(event.target.value)}
      />
      {!compact && (
        <>
          <label htmlFor={`${id}-example`}>Example</label>
          <textarea
            id={`${id}-example`}
            rows={2}
            value={example}
            maxLength={TECHNIQUE_TEXT_MAX}
            onChange={(event) => setExample(event.target.value)}
          />
        </>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="qs-technique-error">
          {error}
        </p>
      )}
      <div className="qs-technique-form-actions">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
