import { QuestionSetPanel } from './QuestionSetPanel';
import { useState } from 'react';
import type {
  QuestionSetAttemptReflection,
  QuestionSetReflectionReason,
} from '../../questions/questionSetAttempts';
import { Button } from '../ui/Button';

const reasons: Record<QuestionSetReflectionReason, string> = {
  'forgotten-knowledge': 'Forgotten knowledge',
  'applying-the-idea': 'Applying the idea',
  'misread-question': 'Misread the question',
  'missing-evidence': 'Missing evidence',
  'calculation-or-units': 'Calculation or units',
  time: 'Time',
  unsure: 'Unsure',
};
export function QuestionSetReflection({
  value,
  busy,
  onChange,
  onDirty,
}: {
  value: QuestionSetAttemptReflection;
  busy: boolean;
  onChange: (value: QuestionSetAttemptReflection) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [note, setNote] = useState(value.note);
  return (
    <QuestionSetPanel title="What would you change?" className="qs-reflection">
      <fieldset>
        <legend className="sr-only">Reflection reasons</legend>
        {(Object.entries(reasons) as [QuestionSetReflectionReason, string][]).map(
          ([reason, label]) => (
            <label className="qs-check" key={reason}>
              <input
                type="checkbox"
                checked={value.reasons.includes(reason)}
                disabled={busy}
                onChange={() =>
                  onChange({
                    ...value,
                    reasons: value.reasons.includes(reason)
                      ? value.reasons.filter((item) => item !== reason)
                      : [...value.reasons, reason],
                  })
                }
              />
              {label}
            </label>
          ),
        )}
      </fieldset>
      <label className="qs-field">
        Reflection
        <textarea
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            onDirty(event.target.value !== value.note);
          }}
        />
      </label>
      <Button
        variant="secondary"
        disabled={busy || note === value.note}
        onClick={() => {
          onChange({ ...value, note });
          onDirty(false);
        }}
      >
        Save reflection
      </Button>
      {note !== value.note && (
        <Button
          variant="ghost"
          onClick={() => {
            setNote(value.note);
            onDirty(false);
          }}
        >
          Cancel reflection
        </Button>
      )}
    </QuestionSetPanel>
  );
}
