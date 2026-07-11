import { useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { m as motion, useMotionValue, useSpring, LayoutGroup } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { Button } from '../components/ui/Button';
import { cn } from '../components/ui/cn';
import {
  PlayIcon,
  CheckIcon,
  FlameIcon,
  KeyboardIcon,
  InfoIcon,
  SparklesIcon,
  ChevronLeftIcon,
  SettingsIcon,
  ChartIcon,
  CardsIcon,
} from '../components/ui/icons';

type Section = {
  id: string;
  label: string;
  icon: React.ReactNode;
  content: React.ReactNode;
};

const HELP_SECTIONS = [
  { id: 'course-model', label: 'Courses & lessons' },
  { id: 'study-modes', label: 'Study modes' },
  { id: 'filtered-modes', label: 'Filtered study' },
  { id: 'how-to-study', label: 'How to study' },
  { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts' },
  { id: 'touch-gestures', label: 'Touch gestures' },
  { id: 'progress', label: 'Progress & scheduling' },
  { id: 'card-types', label: 'Card types' },
  { id: 'tips', label: 'Tips & best practice' },
];

function SectionCard({
  icon,
  label,
  children,
  accent = 'accent',
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  accent?: 'accent' | 'positive' | 'negative' | 'amber';
}) {
  const iconBgClass =
    accent === 'positive'
      ? 'bg-positive/10 text-positive'
      : accent === 'negative'
        ? 'bg-negative/10 text-negative'
        : accent === 'amber'
          ? 'bg-amber-500/10 text-amber-600'
          : 'bg-accent/10 text-accent';

  return (
    <div className="rounded-2xl border border-line bg-surface p-7 shadow-sm md:p-8">
      <div className="mb-5 flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${iconBgClass}`}>
          {icon}
        </span>
        <h2 className="font-display text-2xl tracking-tight">{label}</h2>
      </div>
      {children}
    </div>
  );
}

function ModeCard({
  title,
  description,
  whatItDoes,
  whenToUse,
  tip,
}: {
  title: string;
  description: string;
  whatItDoes: string;
  whenToUse: string;
  tip?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised/60 p-5 transition-colors hover:border-line-strong">
      <h3 className="mb-1.5 font-medium text-ink">{title}</h3>
      <p className="mb-3 text-sm text-ink-soft">{description}</p>
      <div className="space-y-2 text-sm text-ink-soft">
        <p>
          <strong className="text-ink">What it does:</strong> {whatItDoes}
        </p>
        <p>
          <strong className="text-ink">When to use:</strong> {whenToUse}
        </p>
        {tip && (
          <p className="rounded-lg bg-accent-soft/40 px-3 py-2.5 text-xs text-accent-ink">
            <strong className="text-accent">Tip:</strong> {tip}
          </p>
        )}
      </div>
    </div>
  );
}

function NavItem({
  section,
  active,
  onClick,
  index,
  m,
}: {
  section: (typeof HELP_SECTIONS)[number];
  active: boolean;
  onClick: () => void;
  index: number;
  m: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 350, damping: 25 });
  const springY = useSpring(mouseY, { stiffness: 350, damping: 25 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distX = (e.clientX - centerX) * 0.12;
    const distY = (e.clientY - centerY) * 0.12;
    mouseX.set(distX);
    mouseY.set(distY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x: springX, y: springY }}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: 0.04 * index * m,
        duration: 0.35 * m,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'relative flex items-center rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150',
        active ? 'text-accent' : 'text-ink-soft hover:text-ink',
      )}
    >
      {active && (
        <motion.div
          layoutId="helpActivePill"
          className="absolute inset-0 rounded-lg bg-accent/10"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <motion.div
            layoutId="helpActiveBar"
            className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-accent"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-lg bg-gradient-to-r from-accent/10 via-accent/5 to-transparent"
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      )}
      <span className="relative z-10 truncate font-medium">{section.label}</span>
    </motion.button>
  );
}

export function HelpPage() {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [activeSection, setActiveSection] = useState<string>(HELP_SECTIONS[0].id);

  // Track which section is currently visible using IntersectionObserver.
  useEffect(() => {
    const intersecting = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) intersecting.add(entry.target.id);
          else intersecting.delete(entry.target.id);
        });
        const top = HELP_SECTIONS.find((s) => intersecting.has(s.id));
        if (top) setActiveSection(top.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    HELP_SECTIONS.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // If the user navigated directly to a hash (e.g. /help#card-types), scroll
  // to it and highlight the correct sidebar item on mount.
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && HELP_SECTIONS.some((s) => s.id === hash)) {
      setActiveSection(hash);
      const el = document.getElementById(hash);
      if (el) {
        window.requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
      }
    }
  }, []);

  const sections = useMemo<Section[]>(
    () => [
      {
        id: 'course-model',
        label: 'Courses & lessons',
        icon: <CardsIcon width={20} height={20} />,
        content: (
          <div className="space-y-4">
            <p className="text-base text-ink-soft">
              Lacuna organises material into courses. Each course is made up of lessons,
              studied in order along a path.
            </p>
            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Courses</h3>
                <p className="text-sm text-ink-soft">
                  A course is the top-level subject you are studying &mdash; a module, a
                  subject, an exam. The dashboard lists your courses; opening one takes you to
                  its path. A course with a single lesson skips the path and opens straight
                  into that lesson.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">The course path</h3>
                <p className="text-sm text-ink-soft">
                  The path is an ordered sequence of lessons. Completing a lesson unlocks the
                  next one. Alongside lessons, the path can show:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  <li>
                    <strong className="text-ink">Checkpoints:</strong> markers for exam dates
                    you have set on the course. They are informational only and never block
                    progress.
                  </li>
                  <li>
                    <strong className="text-ink">Practice sessions:</strong> nodes that gather
                    up due cards from the lessons studied so far, so you keep reviewing older
                    material as you move through the course.
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Lessons and notes</h3>
                <p className="text-sm text-ink-soft">
                  A lesson holds the notes and cards for one topic. Notes are Markdown blocks
                  where you write out explanations, examples or source material &mdash; add,
                  reorder and edit them directly on the lesson page. Add further lessons from
                  the course path, from course settings under Lessons, or from a single-lesson
                  course view. Cards are the flashcards you actually get quizzed on; create
                  them from the lesson page or generate them from a note.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Question bank</h3>
                <p className="text-sm text-ink-soft">
                  Every course has a question bank listing all of its cards in one place,
                  regardless of which lesson they belong to. Use it to browse, search, edit or
                  bulk-manage cards.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Course settings</h3>
                <p className="text-sm text-ink-soft">
                  Course Settings holds the exam date(s), study objective, scheduling
                  optimisation, import/export and course deletion. Open it from the path page.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'study-modes',
        label: 'Study modes',
        icon: <PlayIcon width={20} height={20} />,
        content: (
          <div className="space-y-4">
            <p className="text-base text-ink-soft">
              Lacuna offers several ways to study your cards. Each mode is designed for a
              different purpose. You can start a session from a lesson, from the course path,
              or from the global &lsquo;Today&rsquo; review across every course.
            </p>
            <div className="grid gap-3">
              <ModeCard
                title="Study all cards"
                description="The default study mode. Uses the FSRS algorithm to schedule cards based on when you are likely to forget them, weighted towards your exam date."
                whatItDoes="Shows cards that are due for review, plus a limited number of new cards each day. The algorithm tracks your performance and schedules each card at the optimal interval to maximise retention while minimising workload."
                whenToUse="Use this for your day-to-day studying. It is the most efficient mode for long-term retention."
                tip="If you have an exam date set, the algorithm prioritises cards that will be weakest on exam day. The progress bar shows how many cards are 'secured' (predicted retrievability above 90%)."
              />
              <ModeCard
                title="Simple learn"
                description="A stripped-back mode with no algorithm. You simply mark each card as correct or incorrect, and it loops until you have answered every card correctly."
                whatItDoes="Shows every card in the course. If you answer correctly, the card is marked as mastered. If you answer incorrectly, the card is sent to the back of the queue and reappears later. The session ends only when every card has been marked correct."
                whenToUse="Use this when you want to learn a set of cards for the first time, or when you want to drill through every card without any algorithmic scheduling."
                tip="The progress bar at the top shows how many cards are wrong, remaining, and mastered. Try to turn them all correct before you finish."
              />
              <ModeCard
                title="Cram mode"
                description="Exam-eve emergency mode. Reorders cards so the weakest ones appear first, bypassing normal scheduling limits."
                whatItDoes="Serves every card in the course, ignoring the daily new-card cap. Cards are ordered by their predicted exam-day retrievability, weakest first. Already-secured cards are pushed to the back."
                whenToUse="Use this only in the final 48 hours before an exam. It trades long-term retention for short-term coverage."
                tip="Cram mode appears automatically in the study dropdown when your exam is within 48 hours. It is not recommended for regular studying."
              />
            </div>
          </div>
        ),
      },
      {
        id: 'filtered-modes',
        label: 'Filtered study',
        icon: <InfoIcon width={20} height={20} />,
        content: (
          <div className="space-y-4">
            <p className="text-base text-ink-soft">
              Filtered study lets you narrow down to a specific subset of cards. These are
              useful for targeted review, maintenance, or catching up on specific categories.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                title="Study due cards"
                description="Cards that are scheduled for review today or are overdue."
                whatItDoes="Shows only cards whose next review date is today or earlier. This is the core of the FSRS algorithm: reviewing cards just before you are likely to forget them."
                whenToUse="Use this when you want to catch up on your review backlog without seeing new cards."
              />
              <ModeCard
                title="Study new cards"
                description="Cards you have never seen before."
                whatItDoes="Shows only cards that have never been reviewed (no learning history). These cards are in the learning phase and will graduate to review after their learning steps."
                whenToUse="Use this when you want to introduce new cards without being distracted by reviews."
              />
              <ModeCard
                title="Study leech cards"
                description="Cards that keep failing."
                whatItDoes="Shows only cards that have failed enough times to cross the leech threshold (default is 8 lapses). These cards usually need rewording, better mnemonics, or splitting into smaller cards."
                whenToUse="Use this when you want to identify and fix cards that are not sticking."
                tip="Consider editing or rewording leech cards. A card that has lapsed many times is often a sign that the card is too complex or poorly phrased."
              />
              <ModeCard
                title="Study flagged cards"
                description="Cards you have manually flagged for attention."
                whatItDoes="Shows only cards that have the flag marker set. You can flag a card during a study session by opening the card menu and selecting 'Flag card'."
                whenToUse="Use this when you want to review cards you have marked as needing attention, without searching through the entire course."
              />
              <ModeCard
                title="Study suspended cards"
                description="Cards that have been removed from normal rotation."
                whatItDoes="Shows only cards that are suspended. Suspended cards are excluded from all normal study sessions. You can suspend a card during a study session or from the card list."
                whenToUse="Use this to review or unsuspend cards you had previously removed from rotation."
              />
            </div>
            <p className="text-base text-ink-soft">
              You can combine multiple filters together (e.g., due + flagged) to study only
              cards that match all selected criteria.
            </p>
          </div>
        ),
      },
      {
        id: 'how-to-study',
        label: 'How to study',
        icon: <KeyboardIcon width={20} height={20} />,
        content: (
          <div className="space-y-4">
            <p className="text-base text-ink-soft">
              The study session is designed to be fast and keyboard-driven. Here is how a
              typical session works.
            </p>
            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">1. Question phase</h3>
                <p className="text-sm text-ink-soft">
                  The card is shown front-side only. Read the question and try to recall the
                  answer. Do not flip the card immediately: the time you spend thinking is
                  what builds memory.
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  <strong className="text-ink">Keyboard:</strong> press Space or the Up arrow to reveal.
                  <br />
                  <strong className="text-ink">Touch:</strong> tap the card or the &lsquo;Show answer&rsquo; button.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">2. Answer phase</h3>
                <p className="text-sm text-ink-soft">
                  The card flips to reveal the answer. Compare your recalled answer with the
                  actual answer. Grade yourself honestly.
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  <strong className="text-ink">Silent grading (default):</strong> press Yes (Space or Right arrow) if you were correct, No (Left arrow) if you were wrong. The algorithm measures your response time to determine how well you knew the card.
                  <br />
                  <strong className="text-ink">Manual grading:</strong> press 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy) to self-grade. Enable this in Settings under &lsquo;Study &amp; scheduling&rsquo;.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">3. Card actions</h3>
                <p className="text-sm text-ink-soft">
                  During a study session, you can perform actions on the current card without
                  leaving the session:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  <li>
                    <strong className="text-ink">Edit (E):</strong> fix a typo or reword the card. The timer pauses while you edit.
                  </li>
                  <li>
                    <strong className="text-ink">Flag:</strong> mark the card for later review in the flagged-cards filter.
                  </li>
                  <li>
                    <strong className="text-ink">Bury:</strong> hide the card until tomorrow. Use this for cards that you already know well or do not want to see today.
                  </li>
                  <li>
                    <strong className="text-ink">Suspend:</strong> remove the card from all study sessions indefinitely. Use this for cards that are no longer relevant.
                  </li>
                  <li>
                    <strong className="text-ink">Undo (U):</strong> undo your last answer if you mis-pressed.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts',
        icon: <KeyboardIcon width={20} height={20} />,
        content: (
          <div className="space-y-4">
            <p className="text-base text-ink-soft">
              All shortcuts can be customised in Settings &rarr; Keyboard shortcuts.
            </p>
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-raised">
                    <th className="px-4 py-3 text-left font-medium text-ink">Action</th>
                    <th className="px-4 py-3 text-left font-medium text-ink">Default key</th>
                    <th className="px-4 py-3 text-left font-medium text-ink">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Reveal answer</td>
                    <td className="px-4 py-3 font-medium text-ink">Space, Up</td>
                    <td className="px-4 py-3 text-ink-soft">Question phase</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Hide answer</td>
                    <td className="px-4 py-3 font-medium text-ink">Down</td>
                    <td className="px-4 py-3 text-ink-soft">Answer phase</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Yes / Correct</td>
                    <td className="px-4 py-3 font-medium text-ink">Right</td>
                    <td className="px-4 py-3 text-ink-soft">Answer phase (silent mode)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">No / Wrong</td>
                    <td className="px-4 py-3 font-medium text-ink">Left</td>
                    <td className="px-4 py-3 text-ink-soft">Answer phase (silent mode)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Again</td>
                    <td className="px-4 py-3 font-medium text-ink">1</td>
                    <td className="px-4 py-3 text-ink-soft">Answer phase (manual mode)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Hard</td>
                    <td className="px-4 py-3 font-medium text-ink">2</td>
                    <td className="px-4 py-3 text-ink-soft">Answer phase (manual mode)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Good</td>
                    <td className="px-4 py-3 font-medium text-ink">3</td>
                    <td className="px-4 py-3 text-ink-soft">Answer phase (manual mode)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Easy</td>
                    <td className="px-4 py-3 font-medium text-ink">4</td>
                    <td className="px-4 py-3 text-ink-soft">Answer phase (manual mode)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Edit card</td>
                    <td className="px-4 py-3 font-medium text-ink">E</td>
                    <td className="px-4 py-3 text-ink-soft">Any time</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Undo last answer</td>
                    <td className="px-4 py-3 font-medium text-ink">U</td>
                    <td className="px-4 py-3 text-ink-soft">Any time</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Focus mode</td>
                    <td className="px-4 py-3 font-medium text-ink">F</td>
                    <td className="px-4 py-3 text-ink-soft">Any time</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-ink-soft">Shortcuts help</td>
                    <td className="px-4 py-3 font-medium text-ink">?</td>
                    <td className="px-4 py-3 text-ink-soft">Any time</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ),
      },
      {
        id: 'touch-gestures',
        label: 'Touch gestures',
        icon: <SparklesIcon width={20} height={20} />,
        content: (
          <div className="space-y-4">
            <p className="text-base text-ink-soft">
              In touch-first mode, the study interface supports swipe gestures for faster
              grading.
            </p>
            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Tap to flip</h3>
                <p className="text-sm text-ink-soft">
                  Tap anywhere on the card to reveal the answer. Tap again to hide it.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Swipe right = Yes</h3>
                <p className="text-sm text-ink-soft">
                  In the answer phase, swipe right on the card to mark it correct. A green glow
                  appears to confirm the action.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Swipe left = No</h3>
                <p className="text-sm text-ink-soft">
                  In the answer phase, swipe left on the card to mark it wrong. A red glow
                  appears to confirm the action.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'progress',
        label: 'Progress & scheduling',
        icon: <CheckIcon width={20} height={20} />,
        content: (
          <div className="space-y-4">
            <p className="text-base text-ink-soft">
              Understanding the progress bar and scheduling helps you use Lacuna more
              effectively.
            </p>
            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">What the progress bar means</h3>
                <p className="text-sm text-ink-soft">
                  The progress bar shows how close your course is to being exam-ready. The exact
                  meaning depends on your exam objective:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  <li>
                    <strong className="text-ink">Secure topics:</strong> the fraction of cards that are predicted to be retrievable at 90% or above on exam day.
                  </li>
                  <li>
                    <strong className="text-ink">Maximise expected marks:</strong> the mean predicted retrievability across all cards on exam day.
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">FSRS scheduling</h3>
                <p className="text-sm text-ink-soft">
                  Lacuna uses FSRS (Free Spaced Repetition Scheduler), an open-source algorithm
                  that models your memory with mathematical precision. It tracks how well you
                  know each card and schedules reviews at the optimal moment: just before you
                  would forget, but not so often that it wastes time.
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  The algorithm adapts to you. Over time, cards you find easy will be shown less
                  frequently, while cards you struggle with will come back sooner.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Optimisation</h3>
                <p className="text-sm text-ink-soft">
                  Lacuna can fit the FSRS weights to your own review history. This is where most
                  of the efficiency gains come from. You can run this manually per course in
                  Course Settings &rarr; Scheduling optimisation, or enable automatic
                  optimisation in Settings &rarr; Study & scheduling.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'card-types',
        label: 'Card types',
        icon: <CardsIcon width={20} height={20} />,
        content: (
          <div className="space-y-4">
            <p className="text-base text-ink-soft">
              Lacuna supports several card types for different kinds of learning.
            </p>
            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Basic card</h3>
                <p className="text-sm text-ink-soft">
                  A simple front-and-back flashcard. The question appears on the front; the answer
                  on the back. This is the default and works for most material.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Reversed card</h3>
                <p className="text-sm text-ink-soft">
                  Creates two cards from one note: one in each direction. Useful for vocabulary
                  (English-to-French and French-to-English) or any bidirectional knowledge.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Typing-answer card</h3>
                <p className="text-sm text-ink-soft">
                  You type the answer into a text box before revealing. This is more demanding
                  than simply recalling, and is excellent for spelling, formulae, or precise
                  terminology.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Cloze card</h3>
                <p className="text-sm text-ink-soft">
                  A sentence with one or more words hidden. You recall the hidden words before
                  revealing them. Useful for context-dependent knowledge and fill-in-the-blank
                  style questions.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'tips',
        label: 'Tips & best practice',
        icon: <FlameIcon width={20} height={20} />,
        content: (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Set an exam date</h3>
                <p className="text-sm text-ink-soft">
                  The single most important thing you can do is set an accurate exam date and time
                  for each course. Without it, Lacuna defaults to a generic rolling horizon and
                  will not prioritise the cards that matter most. The exam date is set in Course
                  Settings.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Keep cards small</h3>
                <p className="text-sm text-ink-soft">
                  Each card should test one atomic fact. Complex cards that require multiple steps
                  are harder to remember and harder to grade. If a card keeps failing, split it.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Be honest when grading</h3>
                <p className="text-sm text-ink-soft">
                  The algorithm is only as good as your self-assessment. If you were not sure,
                  mark it wrong. It is better to review a card one extra time than to forget it on
                  exam day.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Use the Pomodoro timer</h3>
                <p className="text-sm text-ink-soft">
                  The built-in Pomodoro timer helps you maintain focus. Short breaks prevent
                  fatigue, which improves retention. You can customise the durations in
                  Settings &rarr; Pomodoro timer.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <h3 className="mb-2 font-medium text-ink">Export your data regularly</h3>
                <p className="text-sm text-ink-soft">
                  All your data lives locally in your browser. Use the automatic backups feature
                  (Settings &rarr; Automatic backups) or export your data manually to keep a safe
                  copy.
                </p>
              </div>
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8 md:px-10 md:py-10">
      <div className="min-w-0 flex-1 max-w-4xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronLeftIcon width={16} height={16} />
          Back to dashboard
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 * m }}
        >
          <header className="relative mb-10 overflow-hidden rounded-2xl border border-line bg-surface p-8 md:p-10">
            <div className="absolute inset-0 bg-dot-grid opacity-40" aria-hidden="true" />
            <div className="relative">
              <p className="mb-2 text-sm uppercase tracking-[0.18em] text-ink-faint">
                Documentation
              </p>
              <h1 className="font-display text-4xl tracking-tight md:text-6xl">Help</h1>
              <p className="mt-3 max-w-xl text-base text-ink-soft">
                Everything you need to know about using Lacuna, from study modes to keyboard
                shortcuts.
              </p>
            </div>
          </header>

          {/* Sections */}
          <div className="flex flex-col gap-8">
            {sections.map((s, i) => (
              <motion.section
                key={s.id}
                id={s.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.24 * m,
                  delay: Math.min(i * 0.04, 0.2) * m,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <SectionCard icon={s.icon} label={s.label}>
                  {s.content}
                </SectionCard>
              </motion.section>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-10 rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <InfoIcon width={20} height={20} />
            </div>
            <p className="mb-3 text-base text-ink-soft">
              Still have questions? Check the settings pages for more granular controls, or
              explore the analytics page to understand your study patterns.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/settings">
                <Button variant="secondary" size="sm">
                  <SettingsIcon width={16} height={16} />
                  Settings
                </Button>
              </Link>
              <Link to="/analytics">
                <Button variant="secondary" size="sm">
                  <ChartIcon width={16} height={16} />
                  Analytics
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right-side section nav */}
      <aside className="hidden xl:block w-64 shrink-0">
        <div className="sticky top-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 * m, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-xl shadow-black/5 backdrop-blur-sm"
          >
            {/* Ambient top glow that subtly pulses */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Soft radial ambient wash behind the card */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                background:
                  'radial-gradient(circle at 50% 0%, hsl(var(--accent) / 0.06), transparent 55%)',
              }}
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="relative mb-3 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              On this page
            </div>
            <LayoutGroup>
              <nav className="relative flex flex-col gap-1">
                {HELP_SECTIONS.map((section, index) => (
                  <NavItem
                    key={section.id}
                    section={section}
                    active={activeSection === section.id}
                    onClick={() => {
                      const el = document.getElementById(section.id);
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    index={index}
                    m={m}
                  />
                ))}
              </nav>
            </LayoutGroup>
          </motion.div>
        </div>
      </aside>
    </div>
  );
}
