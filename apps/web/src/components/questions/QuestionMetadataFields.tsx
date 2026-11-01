import { fieldLabelClassName, inputFrameClassName } from '../ui/Field';
// The Question editor's metadata: name, lesson, the primary skill practised and optional
// prerequisites. It follows the prompt and answer, so ordinary entry starts with content.

import type { Ref } from 'react';
import type { Lesson } from '@lacuna/core/db/types';
import type { Concept } from '@lacuna/core/questions/types';
import { Button } from '../ui/Button';
import { PlusIcon } from '../ui/icons';
import type { QuestionAuthoringState } from '../../pages/questionDraft';

export const questionInputClass = `${inputFrameClassName} min-h-11 w-full aria-[invalid=true]:border-negative`;
export const questionLabelClass = `${fieldLabelClassName} mb-2`;
export const questionCardClass = 'rounded-3xl bg-surface card-surface';

/** A field's validation message, linked to its control by `id`. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-negative">
      {message}
    </p>
  );
}

type Update = (
  patch:
    | Partial<QuestionAuthoringState>
    | ((current: QuestionAuthoringState) => Partial<QuestionAuthoringState>),
) => void;

export function QuestionMetadataFields({
  state,
  update,
  lessons,
  concepts,
  onAddConcept,
  editable,
  errors,
  nameRef,
  conceptRef,
}: {
  state: QuestionAuthoringState;
  update: Update;
  lessons: Lesson[];
  concepts: Concept[];
  onAddConcept: () => void;
  editable: boolean;
  errors: { name?: string; concept?: string };
  nameRef: Ref<HTMLInputElement>;
  conceptRef: Ref<HTMLSelectElement>;
}) {
  const { name, newConceptName = '', lessonId, targetConceptId, prerequisiteConceptIds } = state;
  const prerequisites = concepts.filter((concept) => concept.id !== targetConceptId);
  return (
    <section className={`grid gap-5 p-5 md:grid-cols-2 md:p-6 ${questionCardClass}`}>
      <label className="block md:col-span-2">
        <span className={questionLabelClass}>Name</span>
        <input
          ref={nameRef}
          value={name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="Completing the square"
          className={questionInputClass}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'question-name-error' : undefined}
        />
        <FieldError id="question-name-error" message={errors.name} />
      </label>
      <label className="block">
        <span className={questionLabelClass}>Lesson</span>
        <select
          value={lessonId}
          onChange={(event) => update({ lessonId: event.target.value })}
          className={questionInputClass}
        >
          <option value="">No primary Lesson</option>
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={questionLabelClass}>Primary skill practised</span>
        <select
          ref={conceptRef}
          value={targetConceptId}
          onChange={(event) => {
            const nextTarget = event.target.value;
            update((current) => ({
              targetConceptId: nextTarget,
              prerequisiteConceptIds: current.prerequisiteConceptIds.filter(
                (id) => id !== nextTarget,
              ),
            }));
          }}
          className={questionInputClass}
          aria-invalid={errors.concept ? true : undefined}
          aria-describedby={errors.concept ? 'question-concept-error' : undefined}
        >
          <option value="">Choose a Concept</option>
          {concepts.map((concept) => (
            <option key={concept.id} value={concept.id}>
              {concept.name}
            </option>
          ))}
        </select>
        <FieldError id="question-concept-error" message={errors.concept} />
      </label>
      <div className="md:col-span-2">
        <span className={questionLabelClass}>Add a Concept</span>
        <div className="flex gap-2">
          <input
            value={newConceptName}
            onChange={(event) => update({ newConceptName: event.target.value })}
            placeholder="A single piece of knowledge"
            className={questionInputClass}
          />
          <Button
            type="button"
            onClick={onAddConcept}
            disabled={!editable || !newConceptName.trim()}
          >
            <PlusIcon width={16} height={16} />
            Add
          </Button>
        </div>
      </div>
      {prerequisites.length > 0 && (
        <fieldset className="md:col-span-2">
          <legend className={questionLabelClass}>Prerequisite Concepts</legend>
          <div className="flex flex-wrap gap-2">
            {prerequisites.map((concept) => {
              const selected = prerequisiteConceptIds.includes(concept.id);
              return (
                <button
                  key={concept.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    update((current) => ({
                      prerequisiteConceptIds: selected
                        ? current.prerequisiteConceptIds.filter((id) => id !== concept.id)
                        : [...current.prerequisiteConceptIds, concept.id],
                    }))
                  }
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${
                    selected
                      ? 'bg-accent-soft text-accent-ink'
                      : 'bg-ink/[0.06] text-ink-soft hover:text-ink'
                  }`}
                >
                  {concept.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </section>
  );
}
