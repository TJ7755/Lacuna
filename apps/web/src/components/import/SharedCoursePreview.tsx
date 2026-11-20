import type { SharePayload } from '../../db/share';

export function SharedCoursePreview({ payload }: { payload: SharePayload }) {
  if (payload.v !== 6) return null;

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
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
