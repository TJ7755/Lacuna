import { useState } from 'react';
import { ConfirmInline } from '../ui/ConfirmInline';
import { makeId } from '../../db/schema';
import type { QuestionAnswer, QuestionResponse } from '../../questions/questionSets';
import { Button } from '../ui/Button';

export function QuestionSetResponseEditor({
  answer,
  onChange,
}: {
  answer: QuestionAnswer;
  onChange: (answer: QuestionAnswer) => void;
}) {
  const [pending, setPending] = useState<QuestionResponse | null>(null);
  const response = answer.response;
  const change = (next: QuestionResponse) => onChange({ ...answer, response: next });
  return (
    <section aria-label="Response format">
      <label className="qs-field">
        Response
        <select
          value={response.kind}
          onChange={(e) => {
            const kind = e.target.value as QuestionResponse['kind'];
            const next: QuestionResponse =
              kind === 'multiple-choice'
                ? {
                    kind,
                    selection: 'single',
                    options: [
                      { id: makeId(), content: '' },
                      { id: makeId(), content: '' },
                    ],
                    correctOptionIds: [],
                  }
                : { kind };
            if (
              response.kind === 'multiple-choice' &&
              response.options.some((option) => option.content.trim())
            )
              setPending(next);
            else change(next);
          }}
        >
          <option value="written">Written answer</option>
          <option value="multiple-choice">Multiple choice</option>
          <option value="calculation">Calculation</option>
        </select>
      </label>
      {pending && (
        <ConfirmInline
          message="Remove the existing answer options?"
          confirmLabel="Change format"
          onConfirm={() => {
            change(pending);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {response.kind === 'multiple-choice' && (
        <>
          <label className="qs-field">
            Selection
            <select
              value={response.selection}
              onChange={(e) =>
                change({
                  ...response,
                  selection: e.target.value as 'single' | 'multiple',
                  correctOptionIds: [],
                })
              }
            >
              <option value="single">Choose one</option>
              <option value="multiple">Choose several</option>
            </select>
          </label>
          <p className="qs-muted">
            Select the correct option{response.selection === 'multiple' ? 's' : ''}. Learners still
            mark their own work.
          </p>
          {response.options.map((option, i) => (
            <div className="qs-option" key={option.id}>
              <input
                type={response.selection === 'single' ? 'radio' : 'checkbox'}
                name="correct-option"
                aria-label={`Option ${i + 1} is correct`}
                checked={response.correctOptionIds.includes(option.id)}
                onChange={() =>
                  change({
                    ...response,
                    correctOptionIds:
                      response.selection === 'single'
                        ? [option.id]
                        : response.correctOptionIds.includes(option.id)
                          ? response.correctOptionIds.filter((id) => id !== option.id)
                          : [...response.correctOptionIds, option.id],
                  })
                }
              />
              <input
                aria-label={`Option ${i + 1}`}
                type="text"
                value={option.content}
                onChange={(e) =>
                  change({
                    ...response,
                    options: response.options.map((o) =>
                      o.id === option.id ? { ...o, content: e.target.value } : o,
                    ),
                  })
                }
              />
              <button
                className="qs-back"
                aria-label={`Remove option ${i + 1}`}
                onClick={() =>
                  change({
                    ...response,
                    options: response.options.filter((o) => o.id !== option.id),
                    correctOptionIds: response.correctOptionIds.filter((id) => id !== option.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              change({ ...response, options: [...response.options, { id: makeId(), content: '' }] })
            }
          >
            Add option
          </Button>
        </>
      )}
    </section>
  );
}
