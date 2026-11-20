import type { SharePayload } from '../../db/share';
import type { ShareCard } from '../../db/sharePayload';
import { countOf } from '../../utils/plural';

export function SharedCoursePreview({ payload }: { payload: SharePayload }) {
  if (payload.v !== 6) return null;

  const lineage = typeof payload.li === 'string' && typeof payload.rv === 'number';
  const idsForCard = (card: ShareCard) => cardIdsForPreview(card, lineage);
  const cardIds = new Set(
    [...payload.lessons.flatMap((lesson) => lesson.cards), ...(payload.bankCards ?? [])].flatMap(
      idsForCard,
    ),
  );
  const lessonIds = payload.lessons.map((lesson) => new Set(lesson.cards.flatMap(idsForCard)));
  const cardCounts = payload.lessons.map((lesson) =>
    lesson.cards.reduce((total, card) => total + (card.k === 2 ? 2 : 1), 0),
  );
  for (const link of payload.links ?? []) {
    const included = lessonIds[link.l];
    if (!included || !cardIds.has(link.c) || included.has(link.c)) continue;
    included.add(link.c);
    // A link names one card, even when its source also generated a reverse card.
    cardCounts[link.l] += 1;
  }

  return (
    <section aria-label="Course preview" className="min-w-0">
      <h2 className="mb-4 font-display text-xl font-semibold">Lessons</h2>
      <ol
        aria-label="Lessons"
        tabIndex={0}
        className="max-h-[36rem] space-y-1 overflow-y-auto overscroll-contain rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
      >
        {payload.lessons.map((lesson, index) => (
          <li
            key={lesson.i ?? index}
            className="flex gap-4 rounded-2xl px-3 py-4 odd:bg-ink/[0.04]"
          >
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink text-sm font-semibold tabular"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold">{lesson.n}</h3>
              {lesson.d && (
                <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-soft">
                  {lesson.d}
                </p>
              )}
              <ul
                aria-label={`Content in ${lesson.n}`}
                className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft"
              >
                <li>{countOf(cardCounts[index], 'card')}</li>
                {lesson.notes.length > 0 && <li>{countOf(lesson.notes.length, 'note')}</li>}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function cardIdsForPreview(card: ShareCard, lineage: boolean): string[] {
  if (!card.id) return [];
  return card.k === 2 && lineage ? [card.id, `${card.id}::rev`] : [card.id];
}
