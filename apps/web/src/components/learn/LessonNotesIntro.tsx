import { useRef } from 'react';
import type { Note } from '../../db/types';
import { LessonNotesStudyView } from '../notes/LessonNotesStudyView';
import { Button } from '../ui/Button';
import { ArrowRightIcon, CloseIcon } from '../ui/icons';
import { PomodoroTimer } from './PomodoroTimer';
import { STUDY_COLUMN, STUDY_HEADER_ROW } from './studyHeaderLayout';
import { useUnclaimedFocus } from '../../hooks/useUnclaimedFocus';

interface LessonNotesIntroProps {
  lessonName: string;
  notes: Note[];
  onExit: () => void;
  onContinue: () => void;
  motionMultiplier: number;
}

/** Notes-first lesson entry, kept outside LearnMode's already-large session controller. */
export function LessonNotesIntro({ lessonName, notes, onExit, onContinue }: LessonNotesIntroProps) {
  // Starting the session removed the control that held focus; Enter now continues.
  const continueRef = useRef<HTMLDivElement>(null);
  useUnclaimedFocus(continueRef);
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-10 bg-paper pt-[env(safe-area-inset-top)]">
        {/* Exit and the timer bound the same column as the notes, so the page reads as one
            measure; Learn's own header takes over when the first card opens. */}
        <div className={`${STUDY_HEADER_ROW} justify-between gap-3`}>
          {/* The same Exit as the study session it leads into, leading the row. */}
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={onExit}
              className="h-11 shrink-0 px-4 max-md:w-11 max-md:px-0"
            >
              <CloseIcon width={16} height={16} aria-hidden="true" />
              <span className="max-md:sr-only">Exit</span>
            </Button>
            <h1 className="min-w-0 truncate text-sm font-semibold text-ink">{lessonName}</h1>
          </div>
          <div className="hidden shrink-0 min-[340px]:block">
            <PomodoroTimer />
          </div>
        </div>
      </header>
      <main
        className={`${STUDY_COLUMN} flex flex-1 flex-col pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]`}
      >
        <LessonNotesStudyView notes={notes} />
        {/* Continue follows the reading, aligned to its edge like the between-steps actions. */}
        <div ref={continueRef} className="mt-6 flex">
          <Button variant="primary" size="lg" onClick={onContinue}>
            Continue
            <ArrowRightIcon />
          </Button>
        </div>
      </main>
    </div>
  );
}
