import type { QuestionAnswer } from '@lacuna/core/questions/questionSets';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import { QuestionSetImage } from './QuestionSetImage';
import { QuestionSetLinksEditor } from './QuestionSetLinksEditor';
import { ComposerTextarea } from './ComposerTextarea';

/** Dimensions and techniques live in the row's techniques card, not a panel. */
export type ComposerPanel = 'image' | 'guidance' | 'links' | null;
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
    <section aria-label="Marking guidance" className="space-y-4">
      {!answer.allocations.length && (
        <p className="text-sm text-ink-soft">Add a mark scheme first.</p>
      )}
      {answer.allocations.map((point, index) => (
        <fieldset className="qs-field" key={point.id}>
          <legend className="text-sm text-ink-soft">
            Point {index + 1} ({point.criterion})
          </legend>
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
        </fieldset>
      ))}
    </section>
  );
}
