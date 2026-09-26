import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { createConcept } from '../../questions/repository.concepts';
import type { QuestionAnswer } from '../../questions/questionSets';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';

export function QuestionSetLinksEditor({
  courseId,
  answer,
  onChange,
}: {
  courseId: string;
  answer: QuestionAnswer;
  onChange: (answer: QuestionAnswer) => void;
}) {
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState(answer.allocations[0]?.id ?? 'prerequisite');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const data = useLiveQuery(
    async () => ({
      concepts: await db.concepts.where('courseId').equals(courseId).toArray(),
      cards: await db.cards.where('courseId').equals(courseId).toArray(),
    }),
    [courseId],
  );
  const selected =
    target === 'prerequisite'
      ? answer.prerequisiteConceptIds
      : (answer.allocations.find((a) => a.id === target)?.targetConceptIds ?? []);
  const toggle = (id: string) => {
    const ids = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
    onChange(
      target === 'prerequisite'
        ? { ...answer, prerequisiteConceptIds: ids }
        : {
            ...answer,
            allocations: answer.allocations.map((a) =>
              a.id === target ? { ...a, targetConceptIds: ids } : a,
            ),
          },
    );
  };
  const matches =
    data?.concepts.filter(
      (c) =>
        c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ||
        data.cards.some(
          (card) =>
            card.conceptId === c.id &&
            `${card.front} ${card.back}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
        ),
    ) ?? [];
  return (
    <section aria-label="Atomic concept links">
      <h3>Atomic concepts</h3>
      <label className="qs-field">
        Link to
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {answer.allocations.map((a, i) => (
            <option key={a.id} value={a.id}>
              Criterion {i + 1}: {a.criterion.slice(0, 60) || 'Untitled'}
            </option>
          ))}
          <option value="prerequisite">Prerequisite knowledge</option>
        </select>
      </label>
      <label className="qs-field">
        Search concepts or cards
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      {matches.map((c) => (
        <div className="qs-concept" key={c.id}>
          <label className="qs-check">
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={() => toggle(c.id)}
            />
            {c.name}
          </label>
          <details className="qs-card-preview">
            <summary className="qs-back">
              Related cards · {data?.cards.filter((card) => card.conceptId === c.id).length ?? 0}
            </summary>
            {data?.cards
              .filter((card) => card.conceptId === c.id)
              .map((card) => (
                <div key={card.id} className="qs-card-preview">
                  <MarkdownView source={card.front} />
                  <details>
                    <summary className="qs-back">Show answer</summary>
                    <MarkdownView source={card.back} />
                  </details>
                </div>
              ))}
          </details>
        </div>
      ))}
      {!matches.length && <p className="qs-muted">No matching concepts or cards.</p>}
      {search.trim() &&
        !data?.concepts.some(
          (c) => c.name.toLocaleLowerCase() === search.trim().toLocaleLowerCase(),
        ) && (
          <Button
            variant="secondary"
            disabled={creating}
            onClick={async () => {
              setCreating(true);
              try {
                const concept = await createConcept(courseId, search.trim());
                toggle(concept.id);
              } catch (cause) {
                setError(String(cause));
              } finally {
                setCreating(false);
              }
            }}
          >
            Create “{search.trim()}”
          </Button>
        )}
    </section>
  );
}
