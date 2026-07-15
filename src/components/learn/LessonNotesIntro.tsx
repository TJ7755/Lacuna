import { m as motion } from 'motion/react';
import type { Note } from '../../db/types';
import { LessonNotesStudyView } from '../notes/LessonNotesStudyView';
import { Button } from '../ui/Button';
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="flex min-h-screen flex-col bg-paper"
    >
      <header className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <p className="min-w-0 truncate text-sm text-ink-faint">{lessonName}</p>
          <div className="flex shrink-0 items-center gap-1">
            <PomodoroTimer />
            <button
              type="button"
              onClick={onExit}
              className="min-h-11 rounded-lg px-3 text-sm text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
            >
              Exit
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <p className="mb-1 text-xs uppercase tracking-wide text-ink-faint">Lesson notes</p>
        <h1 className="mb-6 font-display text-2xl text-ink">{lessonName}</h1>
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
