import type { SharePayload } from '../../db/share';
import { countOf } from '../../utils/plural';

export function SharedCoursePreview({ payload }: { payload: SharePayload }) {
  if (payload.v !== 6) return null;

  return (
    <section aria-label="Course preview" className="min-w-0">
      {payload.course.d && (
        <p className="mb-6 max-w-prose whitespace-pre-line break-words text-sm text-ink-soft">
          {payload.course.d}
        </p>
      )}
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
                <li>
                  {countOf(
                    lesson.cards.reduce((total, card) => total + (card.k === 2 ? 2 : 1), 0),
                    'card',
                  )}
                </li>
                {lesson.notes.length > 0 && <li>{countOf(lesson.notes.length, 'note')}</li>}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
