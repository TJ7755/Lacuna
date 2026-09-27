import { QuestionSetPanel } from './QuestionSetPanel';
import { QuestionSetChoices } from './QuestionSetChoices';
import { useState } from 'react';
import { makeId } from '../../db/schema';
import type { AssessmentDimension, QuestionAnswer } from '../../questions/questionSets';
import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { dimensionNames } from './presentation';

export function QuestionSetSchemeEditor({
  answer,
  onChange,
}: {
  answer: QuestionAnswer;
  onChange: (answer: QuestionAnswer) => void;
}) {
  const [activeId, setActiveId] = useState(answer.allocations[0]?.id);
  const [removing, setRemoving] = useState(false);
  const active = answer.allocations.find((a) => a.id === activeId) ?? answer.allocations[0];
  const allocated = answer.allocations.reduce((sum, a) => sum + a.maxMarks, 0);
  const update = (changes: Partial<NonNullable<typeof active>>) =>
    onChange({
      ...answer,
      allocations: answer.allocations.map((a) => (a.id === active?.id ? { ...a, ...changes } : a)),
    });
  return (
    <section aria-label="Mark scheme">
      <label className="qs-field">
        Total marks for this part
        <input
          type="number"
          min="1"
          step="1"
          value={answer.maxMarks || ''}
          onChange={(e) => onChange({ ...answer, maxMarks: Number(e.target.value) })}
        />
      </label>
      <p className="qs-muted" role={allocated !== answer.maxMarks ? 'status' : undefined}>
        {allocated} of {answer.maxMarks} marks allocated
        {allocated !== answer.maxMarks ? ' — totals must match before saving the set.' : ''}
      </p>
      {answer.allocations.map((a, i) => (
        <button
          className="qs-criterion-row"
          key={a.id}
          aria-expanded={active?.id === a.id}
          onClick={() => {
            setActiveId(a.id);
            setRemoving(false);
          }}
        >
          <span>{i + 1}</span>
          <span>{a.criterion || 'New criterion'}</span>
          <span>
            {a.maxMarks} {a.maxMarks === 1 ? 'mark' : 'marks'}
          </span>
        </button>
      ))}
      {active && (
        <div className="qs-criterion-editor" key={active.id}>
          <MarkdownEditor
            key={`${active.id}-criterion`}
            label="What earns the marks?"
            ariaLabel="Marking criterion"
            value={active.criterion}
            onChange={(criterion) => update({ criterion })}
            minRows={3}
            allowImages={false}
            layout="tabs"
            compactToolbar
          />
          <div className="qs-fields">
            <label className="qs-field">
              Marks
              <input
                type="number"
                min="1"
                step="1"
                value={active.maxMarks || ''}
                onChange={(e) => update({ maxMarks: Number(e.target.value) })}
              />
            </label>
            <QuestionSetChoices
              label="Assesses"
              value={active.dimension}
              onChange={(value) => update({ dimension: value as AssessmentDimension })}
              options={Object.entries(dimensionNames).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <QuestionSetPanel title="Alternatives and marking guidance">
            <MarkdownEditor
              key={`${active.id}-explanation`}
              ariaLabel="Marking guidance"
              value={active.explanation ?? ''}
              onChange={(explanation) => update({ explanation })}
              minRows={3}
              allowImages={false}
              layout="tabs"
              compactToolbar
            />
          </QuestionSetPanel>
          {removing ? (
            <ConfirmInline
              message="Remove this criterion?"
              confirmLabel="Remove"
              onConfirm={() => {
                onChange({
                  ...answer,
                  allocations: answer.allocations.filter((a) => a.id !== active.id),
                });
                setRemoving(false);
              }}
              onCancel={() => setRemoving(false)}
            />
          ) : (
            <button className="qs-back" onClick={() => setRemoving(true)}>
              Remove criterion
            </button>
          )}
        </div>
      )}
      <Button
        variant="secondary"
        onClick={() => {
          const id = makeId();
          onChange({
            ...answer,
            allocations: [
              ...answer.allocations,
              { id, criterion: '', maxMarks: 1, dimension: 'knowledge', targetConceptIds: [] },
            ],
          });
          setActiveId(id);
        }}
      >
        Add criterion
      </Button>
    </section>
  );
}
