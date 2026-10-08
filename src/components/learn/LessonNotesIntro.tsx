import { m as motion } from 'motion/react';
import type { Note } from '../../db/types';
import { LessonNotesStudyView } from '../notes/LessonNotesStudyView';
import { Button } from '../ui/Button';
import { CloseIcon } from '../ui/icons';
import { PomodoroTimer } from './PomodoroTimer';

interface LessonNotesIntroProps {
  lessonName: string;
  notes: Note[];
  onExit: () => void;
  onContinue: () => void;
  motionMultiplier: number;
}

/** Notes-first lesson entry, kept outside LearnMode's already-large session controller. */
export function LessonNotesIntro({
  lessonName,
  notes,
  onExit,
  onContinue,
  motionMultiplier,
}: LessonNotesIntroProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.32 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="flex min-h-screen flex-col bg-paper"
    >
      <header className="sticky top-0 z-10 border-b border-line bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        {/* Learn's header geometry, as on the screen between steps: the controls share the
            card's column and the timer stays in place when the first card opens. */}
        <div className="mx-auto flex min-h-[84px] max-w-4xl items-center justify-between gap-2 py-2.5 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] md:gap-4">
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
          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            <div className="hidden min-[340px]:block">
              <PomodoroTimer />
            </div>
            <span aria-hidden="true" className="w-11 shrink-0 max-md:hidden" />
            <span aria-hidden="true" className="w-11 shrink-0" />
            <span aria-hidden="true" className="w-11 shrink-0" />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col pt-8 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <LessonNotesStudyView notes={notes} />
        <div className="mt-8 flex justify-center">
          <Button variant="primary" size="lg" className="w-full max-w-sm" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </main>
    </motion.div>
  );
}
