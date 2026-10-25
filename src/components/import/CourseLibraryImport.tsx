import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeftIcon } from '../ui/icons';
import { CourseLibraryPicker } from './CourseLibraryPicker';
import { ShareLinkImport } from './ShareLinkImport';
import type { LibraryCourse } from '../../library/catalogue';
import './ImportPanel.css';

const backClassName =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink';

/**
 * The course library with its own way back, for surfaces other than the import panel: search
 * the catalogue, then import the chosen course in place. Escape steps back one level.
 */
export function CourseLibraryImport({
  backLabel,
  onBack,
  onOpenCourse,
}: {
  /** Names where the first Back leads, such as "New course". */
  backLabel: string;
  onBack: () => void;
  onOpenCourse: (courseId: string) => void;
}) {
  const [chosen, setChosen] = useState<{
    course: LibraryCourse;
    shareUrl: string;
    token: symbol;
  }>();
  const [busy, setBusy] = useState(false);
  // Each choice gets its own token, so a late import from an earlier choice never navigates.
  const current = useRef<symbol>(undefined);
  current.current = chosen?.token;
  useEffect(
    () => () => {
      current.current = undefined;
    },
    [],
  );
  const back = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // A chosen course is still loading, so its way back is the first stable control.
    if (chosen) back.current?.focus({ preventScroll: true });
  }, [chosen]);

  const goBack = () => {
    if (busy) return;
    if (chosen) setChosen(undefined);
    else onBack();
  };

  return (
    <div
      className="import-panel"
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        goBack();
      }}
    >
      <header className="mb-3 flex items-center justify-start">
        <button
          ref={back}
          type="button"
          disabled={busy}
          aria-label={chosen ? 'Back to the course library' : `Back to ${backLabel}`}
          onClick={goBack}
          className={backClassName}
        >
          <ChevronLeftIcon width={16} height={16} />
          {chosen ? 'Course library' : backLabel}
        </button>
      </header>
      {chosen ? (
        <ShareLinkImport
          code={chosen.shareUrl}
          chosen
          isCurrent={() => current.current === chosen.token}
          onBusyChange={setBusy}
          onOpenCourse={onOpenCourse}
        />
      ) : (
        <CourseLibraryPicker
          autoFocus
          onChoose={(course, shareUrl) => setChosen({ course, shareUrl, token: Symbol(course.id) })}
        />
      )}
    </div>
  );
}
