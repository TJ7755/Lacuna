import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { createConcept } from '../../questions/repository.concepts';
import { Field, Input, inputClassName } from '../ui/Field';
import { Button } from '../ui/Button';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import type { GeneratedQuestionSetDraft } from '../../questions/questionSetDraftMaintenance';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import { questionGeneratorRegistry } from '../../questions/generators';
import { transitionedQuestion } from '../../questions/questionTransition';
import { generatedConfigurationErrors } from '../../pages/questionValidation';
import { GeneratedQuestionConfiguration } from '../questions/GeneratedQuestionConfiguration';

export function generatedSetPreview(
  content: QuestionSet,
  generated: GeneratedQuestionSetDraft,
): QuestionSet | null {
  try {
    const original = content.questions[0];

    const instance = questionGeneratorRegistry.resolve({
      generatorKey: generated.generatorKey,
      generatorVersion: generated.generatorVersion,
      configuration: generated.configuration,
      seed: `authoring:${content.id}`,
    });
    return {
      ...content,
      questions: [
        transitionedQuestion(
          original?.id ?? content.legacyQuestionId ?? `${content.id}:question`,
          instance,
          {
            targetConceptIds: generated.targetConceptId ? [generated.targetConceptId] : [],
            prerequisiteConceptIds: generated.prerequisiteConceptIds,
          },
        ),
      ],
    };
  } catch {
    return null;
  }
}

export function GeneratedSetConfiguration({
  generated,
  session,
  attempted,
  courseId,
}: {
  generated: GeneratedQuestionSetDraft;
  session: QuestionSetDraftSession;
  attempted: boolean;
  courseId: string;
}) {
  const concepts = useLiveQuery(
    () => db.concepts.where('courseId').equals(courseId).toArray(),
    [courseId],
  );
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const generator = questionGeneratorRegistry.describe(
    generated.generatorKey,
    generated.generatorVersion,
  );
  if (!generator)
    return (
      <p role="alert">
        This generator version is unavailable. Its saved configuration is retained.
      </p>
    );
  return (
    <div className="space-y-6">
      <GeneratedQuestionConfiguration
        generator={generator}
        configuration={generated.configuration}
        onChange={(configuration) => session.updateGenerated({ configuration })}
        errors={
          attempted ? generatedConfigurationErrors(generator, generated.configuration) : undefined
        }
      />
      <section className="rounded-3xl bg-surface p-6 space-y-5">
        <Field
          label="Primary skill practised"
          error={attempted && !generated.targetConceptId ? 'Choose a Concept.' : undefined}
        >
          <select
            className={inputClassName}
            aria-invalid={attempted && !generated.targetConceptId ? true : undefined}
            value={generated.targetConceptId}
            onChange={(event) =>
              session.updateGenerated({
                targetConceptId: event.target.value,
                prerequisiteConceptIds: generated.prerequisiteConceptIds.filter(
                  (id) => id !== event.target.value,
                ),
              })
            }
          >
            <option value="">Choose a Concept</option>
            {concepts?.map((concept) => (
              <option key={concept.id} value={concept.id}>
                {concept.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end gap-3">
          <Field label="Add a Concept" error={error} className="flex-1">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              try {
                const concept = await createConcept(courseId, name);
                session.updateGenerated({ targetConceptId: concept.id });
                setName('');
                setError('');
              } catch (cause) {
                setError(String(cause));
              }
            }}
          >
            Add
          </Button>
        </div>
        {!!concepts?.some((concept) => concept.id !== generated.targetConceptId) && (
          <fieldset>
            <legend className="mb-3 text-sm">Prerequisite Concepts</legend>
            <div className="flex flex-wrap gap-3">
              {concepts
                .filter((concept) => concept.id !== generated.targetConceptId)
                .map((concept) => (
                  <label key={concept.id} className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={generated.prerequisiteConceptIds.includes(concept.id)}
                      onChange={(event) =>
                        session.updateGenerated({
                          prerequisiteConceptIds: event.target.checked
                            ? [...generated.prerequisiteConceptIds, concept.id]
                            : generated.prerequisiteConceptIds.filter((id) => id !== concept.id),
                        })
                      }
                    />
                    {concept.name}
                  </label>
                ))}
            </div>
          </fieldset>
        )}
      </section>
    </div>
  );
}
