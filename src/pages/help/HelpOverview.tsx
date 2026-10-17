import type { ReactNode } from 'react';
import { CardsIcon, KeyboardIcon, PlayIcon, SparklesIcon } from '../../components/ui/icons';
import { useIsTouchMode } from '../../state/inputMode';
import { HelpCard, Kbd } from './HelpUi';

function Entry({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
      <dt className="font-semibold text-ink">{term}</dt>
      <dd className="mt-1 text-sm text-ink-soft">{children}</dd>
    </div>
  );
}

export function BasicsCard() {
  return (
    <HelpCard icon={<CardsIcon width={18} height={18} />} title="Basics">
      <p className="mb-5 text-ink-soft">
        Lacuna organises material into courses. Each course is made up of lessons, studied in order
        along a path.
      </p>
      <dl>
        <Entry term="Courses">
          A course is the top-level subject you are studying &mdash; a module, a subject, an exam.
          Today lists your courses; opening one takes you to its path.
        </Entry>
        <Entry term="The course path">
          The path is an ordered sequence of lessons. Completing a lesson unlocks the next one.
        </Entry>
        <Entry term="Lessons and notes">
          A lesson holds the notes and cards for one topic. Cards are the flashcards you actually
          get quizzed on.
        </Entry>
        <Entry term="Card practice">
          Stops on the path that gather up due cards from the lessons studied so far, so you keep
          reviewing older material as you move through the course.
        </Entry>
        <Entry term="Be honest when grading">
          If you were not sure, mark it wrong. It is better to review a card one extra time than to
          forget it on exam day.
        </Entry>
        <Entry term="Set an exam date">
          The single most important thing you can do is set an accurate exam date and time for each
          course. The exam date is set in Course Settings.
        </Entry>
      </dl>
    </HelpCard>
  );
}

export function StudyingCard() {
  return (
    <HelpCard icon={<PlayIcon width={18} height={18} />} title="Studying">
      <p className="mb-5 text-ink-soft">
        Choose <strong className="text-ink">Study</strong> on Today or a course page to see that
        course&rsquo;s plan, then <strong className="text-ink">Start session</strong>.
      </p>
      <dl>
        <Entry term="Start session">
          The default session, scheduled by FSRS and weighted towards your exam date.
        </Entry>
        <Entry term="Simple learn">A first pass through your cards.</Entry>
        <Entry term="Assessment revision">
          A time-budgeted revision plan for one named checkpoint or final exam.
        </Entry>
      </dl>
    </HelpCard>
  );
}

const KEYS: { action: string; keys: string[] }[] = [
  { action: 'Reveal answer', keys: ['Space', 'Up'] },
  { action: 'Yes / Correct', keys: ['Right'] },
  { action: 'No / Wrong', keys: ['Left'] },
  { action: 'Edit card', keys: ['E'] },
  { action: 'Undo last answer', keys: ['U'] },
  { action: 'Shortcuts help', keys: ['?'] },
];

const GESTURES: { action: string; gesture: string }[] = [
  { action: 'Reveal or hide the answer', gesture: 'Tap' },
  { action: 'Yes / Correct', gesture: 'Swipe right' },
  { action: 'No / Wrong', gesture: 'Swipe left' },
];

/** The essentials for the current input mode; the full lists live in the rows below. */
export function ShortcutsCard() {
  const touch = useIsTouchMode();

  return (
    <HelpCard
      icon={
        touch ? <SparklesIcon width={18} height={18} /> : <KeyboardIcon width={18} height={18} />
      }
      title="Shortcuts"
    >
      <ul className="space-y-2.5 text-sm">
        {touch
          ? GESTURES.map(({ action, gesture }) => (
              <li key={action} className="flex items-center justify-between gap-3">
                <span className="text-ink-soft">{action}</span>
                <span className="font-medium text-ink">{gesture}</span>
              </li>
            ))
          : KEYS.map(({ action, keys }) => (
              <li key={action} className="flex items-center justify-between gap-3">
                <span className="text-ink-soft">{action}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </span>
              </li>
            ))}
      </ul>
      {!touch && (
        <p className="mt-5 text-sm text-ink-faint">
          All shortcuts can be customised in Settings &rarr; Keyboard shortcuts.
        </p>
      )}
    </HelpCard>
  );
}
