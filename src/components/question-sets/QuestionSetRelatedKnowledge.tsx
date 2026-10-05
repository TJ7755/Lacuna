import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';

export function QuestionSetRelatedKnowledge({
  courseId,
  conceptIds,
  submitted,
  beforeReveal,
}: {
  courseId: string;
  conceptIds: string[];
  submitted: boolean;
  beforeReveal: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cards = useLiveQuery(
    () =>
      db.cards
        .where('courseId')
        .equals(courseId)
        .filter((card) => Boolean(card.conceptId && conceptIds.includes(card.conceptId)))
        .toArray(),
    [courseId, conceptIds.join(',')],
    [],
  );
  if (!cards.length) return null;
  return (
    <section className="qs-related">
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          setBusy(true);
          void (submitted ? Promise.resolve() : beforeReveal())
            .then(() => setOpen(true))
            .catch((cause) =>
              setError(cause instanceof Error ? cause.message : 'Could not record assistance.'),
            )
            .finally(() => setBusy(false));
        }}
      >
        {open
          ? 'Hide related cards'
          : submitted
            ? 'Related cards'
            : 'Use related cards · records assistance'}
      </Button>
      {error && <p role="alert">{error}</p>}
      {open &&
        cards.map((card) => (
          <section className="qs-card-preview" key={card.id}>
            <MarkdownView source={card.front} />
            <MarkdownView source={card.back} />
          </section>
        ))}
    </section>
  );
}
