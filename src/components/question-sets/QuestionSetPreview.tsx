import { useState } from 'react';
import { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import type { QuestionSet } from '../../questions/questionSets';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';

/** Shared answerable-content renderer. Preview responses never become learner evidence. */
export function QuestionSetPreview({
  content,
  authorPreview = false,
}: {
  content: QuestionSet;
  authorPreview?: boolean;
}) {
  const nodes = flattenQuestionSet(content);
  const answerable = nodes.filter((n) => n.node.answer);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string | string[]>>({});
  const [scheme, setScheme] = useState(false);
  const active = answerable[index] ?? answerable[0];
  if (!active) return <p className="qs-muted">Add an answerable question or part to preview it.</p>;
  const answer = active.node.answer!;
  const label = [
    ...active.parentIds.map((id) => nodes.find((n) => n.id === id)!.label),
    active.label,
  ].join(' ');
  const value = responses[active.id] ?? (answer.response.kind === 'multiple-choice' ? [] : '');
  return (
    <article className="qs-paper">
      <header className="qs-part-bar">
        <h2>{label}</h2>
        <span className="qs-muted">
          {answer.maxMarks} {answer.maxMarks === 1 ? 'mark' : 'marks'}
        </span>
      </header>
      {active.parentIds.map((id) => (
        <section className="qs-source" key={id}>
          <MarkdownView source={nodes.find((n) => n.id === id)!.node.prompt} />
        </section>
      ))}
      <MarkdownView source={active.node.prompt} />
      {answer.response.kind === 'multiple-choice' ? (
        <fieldset className="mt-6">
          <legend className="qs-muted">
            {answer.response.selection === 'single' ? 'Choose one answer' : 'Choose all that apply'}
          </legend>
          {answer.response.options.map((o, i) => (
            <label key={o.id} className="qs-check">
              <input
                type={
                  answer.response.kind === 'multiple-choice' &&
                  answer.response.selection === 'single'
                    ? 'radio'
                    : 'checkbox'
                }
                name={active.id}
                checked={Array.isArray(value) && value.includes(o.id)}
                onChange={() =>
                  setResponses({
                    ...responses,
                    [active.id]:
                      answer.response.kind === 'multiple-choice' &&
                      answer.response.selection === 'single'
                        ? [o.id]
                        : Array.isArray(value) && value.includes(o.id)
                          ? value.filter((v) => v !== o.id)
                          : [...(Array.isArray(value) ? value : []), o.id],
                  })
                }
              />
              <span>
                {String.fromCharCode(65 + i)}. <MarkdownView source={o.content} />
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <label className="qs-field">
          {answer.response.kind === 'calculation' ? 'Your working and answer' : 'Your answer'}
          <textarea
            className="qs-preview-answer"
            rows={7}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setResponses({ ...responses, [active.id]: e.target.value })}
          />
        </label>
      )}
      {authorPreview && (
        <>
          <button className="qs-back" onClick={() => setScheme(!scheme)}>
            {scheme ? 'Hide mark scheme' : 'Preview mark scheme'}
          </button>
          {scheme && (
            <div className="qs-preview-scheme">
              {answer.allocations.map((a, i) => (
                <section key={a.id} className="qs-source">
                  <p className="qs-kicker">
                    Criterion {i + 1} · {a.maxMarks} {a.maxMarks === 1 ? 'mark' : 'marks'}
                  </p>
                  <MarkdownView source={a.criterion} />
                  {a.explanation && <MarkdownView source={a.explanation} />}
                </section>
              ))}
            </div>
          )}
        </>
      )}
      <nav className="qs-preview-nav" aria-label="Preview parts">
        <Button
          variant="secondary"
          disabled={index === 0}
          onClick={() => {
            setIndex(index - 1);
            setScheme(false);
          }}
        >
          Previous
        </Button>
        <span className="qs-muted">
          {index + 1} / {answerable.length}
        </span>
        <Button
          variant="secondary"
          disabled={index >= answerable.length - 1}
          onClick={() => {
            setIndex(index + 1);
            setScheme(false);
          }}
        >
          Next
        </Button>
      </nav>
    </article>
  );
}
