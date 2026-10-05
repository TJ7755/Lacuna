import { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import type { QuestionSet } from '../../questions/questionSets';
import { MarkdownView } from '../markdown/MarkdownView';

/** The same question and response controls serve author previews and real attempts. */
export function QuestionSetAnswer({
  content,
  nodeId,
  value,
  onChange,
  readOnly = false,
}: {
  content: QuestionSet;
  nodeId: string;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  readOnly?: boolean;
}) {
  const nodes = flattenQuestionSet(content);
  const active = nodes.find((node) => node.id === nodeId);
  if (!active?.node.answer) return null;
  const answer = active.node.answer;
  const format = answer.response;
  const label = [
    ...active.parentIds.map((id) => nodes.find((node) => node.id === id)!.label),
    active.label,
  ].join(' ');
  return (
    <>
      <header className="qs-part-bar">
        <h2 tabIndex={-1}>{label}</h2>
        <span className="qs-muted">
          {answer.maxMarks} {answer.maxMarks === 1 ? 'mark' : 'marks'}
        </span>
      </header>
      {active.parentIds.map((id) => (
        <section className="qs-source" key={id}>
          <MarkdownView enlargeImages source={nodes.find((node) => node.id === id)!.node.prompt} />
        </section>
      ))}
      <MarkdownView enlargeImages source={active.node.prompt} />
      {format.kind === 'multiple-choice' ? (
        <fieldset className="mt-6">
          <legend className="qs-muted">
            {format.selection === 'single' ? 'Choose one answer' : 'Choose all that apply'}
          </legend>
          {format.options.map((option, index) => (
            <div key={option.id} className="qs-check qs-option">
              <input
                disabled={readOnly}
                type={format.selection === 'single' ? 'radio' : 'checkbox'}
                name={active.id}
                id={`${active.id}-${option.id}`}
                aria-labelledby={`${active.id}-${option.id}-content`}
                checked={Array.isArray(value) && value.includes(option.id)}
                onChange={() => {
                  if (readOnly) return;
                  onChange(
                    format.selection === 'single'
                      ? [option.id]
                      : Array.isArray(value) && value.includes(option.id)
                        ? value.filter((id) => id !== option.id)
                        : [...(Array.isArray(value) ? value : []), option.id],
                  );
                }}
              />
              <label className="qs-option-target" htmlFor={`${active.id}-${option.id}`}>
                <span className="sr-only">Select option {String.fromCharCode(65 + index)}</span>
              </label>
              <span className="qs-option-content" id={`${active.id}-${option.id}-content`}>
                {String.fromCharCode(65 + index)}.{' '}
                <MarkdownView enlargeImages source={option.content} />
              </span>
            </div>
          ))}
        </fieldset>
      ) : (
        <label className="qs-field">
          {format.kind === 'calculation' ? 'Your working and answer' : 'Your answer'}
          <textarea
            className="qs-preview-answer"
            rows={8}
            readOnly={readOnly}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => {
              if (!readOnly) onChange(event.target.value);
            }}
          />
        </label>
      )}
    </>
  );
}
