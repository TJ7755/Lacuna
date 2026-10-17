import type { AssessmentDimension, QuestionAnswer } from '../../questions/questionSets';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import { QuestionSetImage } from './QuestionSetImage';
import { QuestionSetLinksEditor } from './QuestionSetLinksEditor';
import { dimensionNames } from './presentation';
import { ComposerTextarea } from './ComposerTextarea';

export type ComposerPanel = 'image' | 'guidance' | 'dimensions' | 'links' | null;
export function QuestionComposerExtras({
  panel,
  answer,
  onChange,
  session,
  nodeId,
  courseId,
}: {
  panel: ComposerPanel;
  answer: QuestionAnswer;
  onChange: (answer: QuestionAnswer) => void;
  session: QuestionSetDraftSession;
  nodeId: string;
  courseId: string;
}) {
  if (panel === 'image') return <QuestionSetImage session={session} nodeId={nodeId} />;
  if (panel === 'links')
    return <QuestionSetLinksEditor courseId={courseId} answer={answer} onChange={onChange} />;
  return (
    <section
      aria-label={panel === 'guidance' ? 'Marking guidance' : 'What it tests'}
      className="space-y-4"
    >
      {!answer.allocations.length && (
        <p className="text-sm text-ink-soft">Add a mark scheme first.</p>
      )}
      {answer.allocations.map((point, index) => (
        <label className="qs-field" key={point.id}>
          <span className="text-sm text-ink-soft">
            Point {index + 1} · {point.criterion}
          </span>
          {panel === 'guidance' ? (
            <ComposerTextarea
              aria-label={`Point ${index + 1} marking guidance`}
              value={point.explanation ?? ''}
              onChange={(event) =>
                onChange({
                  ...answer,
                  allocations: answer.allocations.map((allocation) =>
                    allocation.id === point.id
                      ? { ...allocation, explanation: event.target.value }
                      : allocation,
                  ),
                })
              }
            />
          ) : (
            <select
              aria-label={`Point ${index + 1} dimension`}
              value={point.dimension}
              onChange={(event) =>
                onChange({
                  ...answer,
                  allocations: answer.allocations.map((allocation) =>
                    allocation.id === point.id
                      ? { ...allocation, dimension: event.target.value as AssessmentDimension }
                      : allocation,
                  ),
                })
              }
            >
              {Object.entries(dimensionNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}
    </section>
  );
}
