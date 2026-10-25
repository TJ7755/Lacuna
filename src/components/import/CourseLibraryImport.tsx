import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { ChevronLeftIcon } from '../ui/icons';
import { CourseLibraryPicker, type LibraryBrowseState } from './CourseLibraryPicker';
import { StepSwap } from '../ui/StepSwap';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { ShareLinkImport } from './ShareLinkImport';
import type { LibraryCourse } from '../../library/catalogue';
import './ImportPanel.css';

/**
 * The course library with its own way back, for surfaces other than the import panel: search
 * the catalogue, then import the chosen course in place. Escape steps back one level.
 */
export function CourseLibraryImport({
  backLabel,
  onBack,
  onOpenCourse,
  onBusyChange,
  browse,
  onBrowseChange,
}: {
  /** Names where the first Back leads, such as "New course". */
  backLabel: string;
  browse: LibraryBrowseState;
  onBrowseChange: (browse: LibraryBrowseState) => void;
  onBack: () => void;
  onOpenCourse: (courseId: string) => void;
  /** True while a course is being written, so the surrounding way out can wait too. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 * multiplier }}
      className="import-panel import-course-library"
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        goBack();
      }}
    >
      <header className="mb-3 flex items-center justify-start">
        <Button
          ref={back}
          type="button"
          disabled={busy}
          aria-label={chosen ? 'Back to the course library' : `Back to ${backLabel}`}
          onClick={goBack}
          variant="ghost"
          hoverScale={false}
          style={{ paddingInline: 12, gap: 6 }}
        >
          <ChevronLeftIcon width={16} height={16} />
          {chosen ? 'Course library' : backLabel}
        </Button>
      </header>
      <StepSwap stepKey={chosen ? chosen.course.id : 'catalogue'} direction={chosen ? 1 : -1}>
        {chosen ? (
          <ShareLinkImport
            code={chosen.shareUrl}
            chosen
            isCurrent={() => current.current === chosen.token}
            onBusyChange={(next) => {
              setBusy(next);
              onBusyChange?.(next);
            }}
            onOpenCourse={onOpenCourse}
          />
        ) : (
          <CourseLibraryPicker
            browse={browse}
            onBrowseChange={onBrowseChange}
            autoFocus
            onChoose={(course, shareUrl) =>
              setChosen({ course, shareUrl, token: Symbol(course.id) })
            }
          />
        )}
      </StepSwap>
    </motion.div>
  );
}
