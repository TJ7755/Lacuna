import { useState } from 'react';
import type { CourseRecord } from '@lacuna/core/db/types';
import { isBuiltInTechniqueId, SCIENCE_TECHNIQUES } from '@lacuna/core/questions/techniqueTags';
import { canEditLessons } from '../../course/lessonViewMode';
import {
  addBuiltInTechniques,
  CourseTechniqueError,
  createCourseTechnique,
  setCourseTechniqueArchived,
  updateCourseTechnique,
  useCourseTechniques,
} from '../../questions/courseTechniques';
import { TechniqueForm } from '../../components/question-sets/TechniqueForm';
import { AnimatedDisclosure } from '../../components/ui/AnimatedDisclosure';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

export function courseTechniquesSummary(count: number | undefined): string {
  if (!count) return 'None yet';
  return `${count} technique${count === 1 ? '' : 's'}`;
}

/**
 * The course's exam-technique catalogue. Archiving rather than deleting keeps every tag and
 * learner's history intact while removing the technique from tagging, Jev and Study.
 */
export function CourseTechniquesSection({ course }: { course: CourseRecord }) {
  const catalogue = useCourseTechniques(course.id);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { notify } = useToast();
  const editable = canEditLessons(course) && !course.archived;
  if (!catalogue) return null;
  const active = catalogue.filter((technique) => !technique.archived);
  const archived = catalogue.filter((technique) => technique.archived);
  const unusedBuiltIns = SCIENCE_TECHNIQUES.filter(
    (builtIn) => !active.some((technique) => technique.id === builtIn.id),
  );
  const attempt = (action: Promise<unknown>) =>
    action.catch((error: unknown) =>
      notify(
        error instanceof CourseTechniqueError ? error.message : 'The change was not saved.',
        'negative',
      ),
    );
  return (
    <div className="flex flex-col gap-5">
      {active.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {active.map((technique) => (
            <li key={technique.id} className="py-3">
              {editing === technique.id ? (
                <TechniqueForm
                  initial={technique}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (input) => {
                    await updateCourseTechnique(course.id, technique.id, input);
                    setEditing(null);
                  }}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">
                      {technique.name}
                      {isBuiltInTechniqueId(technique.id) && (
                        <span className="ml-2 text-xs font-normal text-ink-faint">Built-in</span>
                      )}
                    </p>
                    {technique.description && (
                      <p className="mt-0.5 text-sm text-ink-soft">{technique.description}</p>
                    )}
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${technique.name}`}
                        onClick={() => setEditing(technique.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Archive ${technique.name}`}
                        title="Hidden from tagging, Jev and Study; past practice is kept"
                        onClick={() =>
                          attempt(setCourseTechniqueArchived(course.id, technique.id, true))
                        }
                      >
                        Archive
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable &&
        (editing === 'new' ? (
          <TechniqueForm
            submitLabel="Create"
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await createCourseTechnique(course.id, input);
              setEditing(null);
            }}
          />
        ) : (
          <div>
            <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
              New technique
            </Button>
          </div>
        ))}
      {editable && unusedBuiltIns.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Built-in</h3>
          <div className="qs-technique-chips">
            {unusedBuiltIns.map((builtIn) => (
              <button
                key={builtIn.id}
                type="button"
                className="qs-technique-chip"
                data-state="off"
                title={builtIn.description}
                aria-label={`Add ${builtIn.name}`}
                onClick={() => attempt(addBuiltInTechniques(course.id, [builtIn.id]))}
              >
                + {builtIn.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {archived.length > 0 && (
        <div>
          <button
            type="button"
            className="text-sm text-ink-soft underline underline-offset-2"
            aria-expanded={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          >
            Archived ({archived.length})
          </button>
          <AnimatedDisclosure open={showArchived}>
            <ul className="mt-2 flex flex-col gap-1">
              {archived.map((technique) => (
                <li key={technique.id} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 text-ink-soft">{technique.name}</span>
                  {editable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Restore ${technique.name}`}
                      onClick={() =>
                        attempt(setCourseTechniqueArchived(course.id, technique.id, false))
                      }
                    >
                      Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </AnimatedDisclosure>
        </div>
      )}
    </div>
  );
}
