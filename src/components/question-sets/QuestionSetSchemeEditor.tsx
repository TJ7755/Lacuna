import { useState } from 'react';
import { makeId } from '../../db/schema';
import type {
  AssessmentDimension,
  MarkAllocation,
  QuestionAnswer,
} from '../../questions/questionSets';
import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { QuestionSetChoices } from './QuestionSetChoices';
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
  const commit = (allocations: MarkAllocation[]) =>
    onChange({
      ...answer,
      allocations,
      maxMarks: allocations.reduce((sum, allocation) => sum + allocation.maxMarks, 0),
    });
  const update = (changes: Partial<MarkAllocation>) =>
    commit(answer.allocations.map((a) => (a.id === active?.id ? { ...a, ...changes } : a)));
  return (
    <section aria-label="Mark scheme">
      <p className="qs-flow-total">
        Total: {answer.maxMarks} {answer.maxMarks === 1 ? 'mark' : 'marks'}
      </p>
      {answer.allocations.length > 1 && (
        <nav className="qs-actions mb-5" aria-label="Marking points">
          {answer.allocations.map((allocation, i) => (
            <Button
              key={allocation.id}
              aria-pressed={active?.id === allocation.id}
              onClick={() => {
                setActiveId(allocation.id);
                setRemoving(false);
              }}
            >
              Marking point {i + 1}
            </Button>
          ))}
        </nav>
      )}
      {active && (
        <div key={active.id}>
          <MarkdownEditor
            label="What earns these marks?"
            ariaLabel="Marking criterion"
            value={active.criterion}
            onChange={(criterion) => update({ criterion })}
            minRows={4}
            allowImages={false}
            layout="tabs"
            compactToolbar
          />
          <label className="qs-field">
            Marks for this point
            <input
              type="number"
              min="1"
              step="1"
              value={active.maxMarks || ''}
              onChange={(event) => update({ maxMarks: Number(event.target.value) })}
            />
          </label>
          <QuestionSetChoices
            label="What does this point assess?"
            value={active.dimension}
            onChange={(value) => update({ dimension: value as AssessmentDimension })}
            options={Object.entries(dimensionNames).map(([value, label]) => ({ value, label }))}
          />
          <p className="qs-muted mb-5">
            Knowledge: recall a fact. Application: use an idea. Exam technique: communicate,
            calculate or follow the question’s requirements.
          </p>
          <MarkdownEditor
            label="Marking guidance (optional)"
            ariaLabel="Marking guidance"
            value={active.explanation ?? ''}
            onChange={(explanation) => update({ explanation })}
            minRows={3}
            allowImages={false}
            layout="tabs"
            compactToolbar
          />
          {removing ? (
            <ConfirmInline
              message="Remove this marking point?"
              confirmLabel="Remove"
              onConfirm={() => {
                commit(answer.allocations.filter((a) => a.id !== active.id));
                setRemoving(false);
              }}
              onCancel={() => setRemoving(false)}
            />
          ) : (
            answer.allocations.length > 1 && (
              <Button variant="ghost" onClick={() => setRemoving(true)}>
                Remove marking point
              </Button>
            )
          )}
        </div>
      )}
      <Button
        className="mt-5"
        onClick={() => {
          const id = makeId();
          commit([
            ...answer.allocations,
            { id, criterion: '', maxMarks: 1, dimension: 'knowledge', targetConceptIds: [] },
          ]);
          setActiveId(id);
        }}
      >
        Add marking point
      </Button>
    </section>
  );
}
