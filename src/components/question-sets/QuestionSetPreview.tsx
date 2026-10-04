import { useState } from 'react';
import { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import type { QuestionSet } from '../../questions/questionSets';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';
import { QuestionSetAnswer } from './QuestionSetAnswer';

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
  const value = responses[active.id] ?? (answer.response.kind === 'multiple-choice' ? [] : '');
  return (
    <article className="qs-paper">
      <QuestionSetAnswer
        content={content}
        nodeId={active.id}
        value={value}
        onChange={(next) => setResponses({ ...responses, [active.id]: next })}
      />
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
