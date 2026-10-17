import { InfoIcon, KeyboardIcon, PlayIcon, SparklesIcon } from '../../components/ui/icons';
import { HelpCard, HelpIntro, ModeCard, Topic } from './HelpUi';

export function StudyingTopics() {
  return (
    <>
      <HelpCard id="study-modes" icon={<PlayIcon width={18} height={18} />} title="Study modes">
        <HelpIntro>
          Choose <strong className="text-ink">Study</strong> on Today or a course page to see that
          course&rsquo;s plan, then <strong className="text-ink">Start session</strong>.{' '}
          <strong className="text-ink">Other ways</strong> in the same sheet offers the alternatives
          below.
        </HelpIntro>
        <div>
          <ModeCard
            title="Start session"
            description="The default session. Uses the FSRS algorithm to schedule cards based on when you are likely to forget them, weighted towards your exam date."
            whatItDoes="Follows the course path: the next lesson or Card practice first, then the cards due for review. The algorithm tracks your performance and schedules each card at the interval that best balances retention against workload."
            whenToUse="Use this for your day-to-day studying. It is the most efficient mode for long-term retention."
            tip="If you have an exam date set, the algorithm prioritises cards that will be weakest on exam day. The progress bar shows how many cards are 'secured' (predicted retrievability above 90%)."
          />
          <ModeCard
            title="Simple learn"
            description="A first pass through your cards. Mark each answer correct or incorrect; your answers also start spaced-repetition scheduling."
            whatItDoes="Shows every card in the course. If you answer correctly, the card is marked as mastered. If you answer incorrectly, the card is sent to the back of the queue and reappears later. The session ends only when every card has been marked correct."
            whenToUse="Use this when learning material for the first time. Turn off Learn first in course settings to start directly with spaced repetition."
            tip="The progress bar at the top shows how many cards are wrong, remaining, and mastered. Try to turn them all correct before you finish."
          />
          <ModeCard
            title="Assessment revision"
            description="A time-budgeted revision plan for one named checkpoint or final exam."
            whatItDoes="Uses the assessment’s covered lessons, removes excluded and unavailable cards, and limits revision to material you have reached and studied. Plans persist by day, can be left and resumed, and never complete a course practice milestone."
            whenToUse="Choose it from a relevant Card practice stop, checkpoint details, or Study when an upcoming assessment overlaps material you have reached."
            tip="Set today’s time and edit future days before starting. The plan estimates each review’s assessment-day value and reports what was covered, improved, parked or not reached. If the model is unavailable, it says so and uses ordinary practice ordering."
          />
        </div>
      </HelpCard>

      <HelpCard
        id="filtered-modes"
        icon={<InfoIcon width={18} height={18} />}
        title="Filtered study"
      >
        <HelpIntro>
          Filtered study lets you narrow down to a specific subset of cards. These are useful for
          targeted review, maintenance, or catching up on specific categories.
        </HelpIntro>
        <div>
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
        <p className="mt-5 text-ink-soft">
          You can combine multiple filters together (e.g., due + flagged) to study only cards that
          match all selected criteria.
        </p>
      </HelpCard>

      <HelpCard
        id="how-to-study"
        icon={<KeyboardIcon width={18} height={18} />}
        title="How to study"
      >
        <HelpIntro>
          The study session is designed to be fast and keyboard-driven. Here is how a typical
          session works.
        </HelpIntro>
        <div>
          <Topic title="1. Question phase">
            <p>
              The card is shown front-side only. Read the question and try to recall the answer. Do
              not flip the card immediately: the time you spend thinking is what builds memory.
            </p>
            <p>
              <strong className="text-ink">Keyboard:</strong> press Space or the Up arrow to reveal.
              <br />
              <strong className="text-ink">Touch:</strong> tap the card or the &lsquo;Show
              answer&rsquo; button.
            </p>
          </Topic>
          <Topic title="2. Answer phase">
            <p>
              The card flips to reveal the answer. Compare your recalled answer with the actual
              answer. Grade yourself honestly.
            </p>
            <p>
              <strong className="text-ink">Silent grading (default):</strong> press Yes (Space or
              Right arrow) if you were correct, No (Left arrow) if you were wrong. The algorithm
              measures your response time to determine how well you knew the card.
              <br />
              <strong className="text-ink">Manual grading:</strong> press 1 (Again), 2 (Hard), 3
              (Good), or 4 (Easy) to self-grade. Enable this in Settings under &lsquo;Study &amp;
              scheduling&rsquo;.
            </p>
          </Topic>
          <Topic title="3. Card actions">
            <p>
              During a study session, you can perform actions on the current card without leaving
              the session:
            </p>
            <ul>
              <li>
                <strong className="text-ink">Edit (E):</strong> fix a typo or reword the card. The
                timer pauses while you edit.
              </li>
              <li>
                <strong className="text-ink">Flag:</strong> mark the card for later review in the
                flagged-cards filter.
              </li>
              <li>
                <strong className="text-ink">Bury:</strong> hide the card until tomorrow. Use this
                for cards that you already know well or do not want to see today.
              </li>
              <li>
                <strong className="text-ink">Suspend:</strong> remove the card from all study
                sessions indefinitely. Use this for cards that are no longer relevant.
              </li>
              <li>
                <strong className="text-ink">Undo (U):</strong> undo your last answer if you
                mis-pressed.
              </li>
            </ul>
          </Topic>
        </div>
      </HelpCard>
    </>
  );
}

const SHORTCUTS: [action: string, key: string, when: string][] = [
  ['Reveal answer', 'Space, Up', 'Question phase'],
  ['Hide answer', 'Down', 'Answer phase'],
  ['Yes / Correct', 'Right', 'Answer phase (silent mode)'],
  ['No / Wrong', 'Left', 'Answer phase (silent mode)'],
  ['Again', '1', 'Answer phase (manual mode)'],
  ['Hard', '2', 'Answer phase (manual mode)'],
  ['Good', '3', 'Answer phase (manual mode)'],
  ['Easy', '4', 'Answer phase (manual mode)'],
  ['Edit card', 'E', 'Any time'],
  ['Undo last answer', 'U', 'Any time'],
  ['Focus mode', 'F', 'Any time'],
  ['Shortcuts help', '?', 'Any time'],
  ['Study', 'S', 'Today, course and lesson pages'],
  ['New card', 'N', 'Cards page, lesson in edit mode'],
  ['Search cards', '/', 'Cards page'],
  ['Save or submit', 'Ctrl/Cmd+Enter', 'Dialogs and card editor'],
  ['Bold or italic', 'Ctrl/Cmd+B, Ctrl/Cmd+I', 'Text editors'],
  ['Cancel', 'Esc', 'Dialogs and card editor'],
];

export function ShortcutTopics() {
  return (
    <>
      <HelpCard
        id="keyboard-shortcuts"
        icon={<KeyboardIcon width={18} height={18} />}
        title="Keyboard shortcuts"
      >
        <HelpIntro>
          All shortcuts can be customised in Settings &rarr; Keyboard shortcuts.
        </HelpIntro>
        {/* Scrolls within itself on narrow screens or enlarged text, so no column is clipped. */}
        <div
          role="region"
          aria-label="Keyboard shortcuts table"
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-raised">
                <th className="px-4 py-3 text-left font-medium text-ink">Action</th>
                <th className="px-4 py-3 text-left font-medium text-ink">Default key</th>
                <th className="px-4 py-3 text-left font-medium text-ink">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {SHORTCUTS.map(([action, key, when]) => (
                <tr key={action}>
                  <td className="px-4 py-3 text-ink-soft">{action}</td>
                  <td className="px-4 py-3 font-medium text-ink">{key}</td>
                  <td className="px-4 py-3 text-ink-soft">{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HelpCard>

      <HelpCard
        id="touch-gestures"
        icon={<SparklesIcon width={18} height={18} />}
        title="Touch gestures"
      >
        <HelpIntro>
          In touch-first mode, the study interface supports swipe gestures for faster grading.
        </HelpIntro>
        <div>
          <Topic title="Tap to flip">
            <p>Tap anywhere on the card to reveal the answer. Tap again to hide it.</p>
          </Topic>
          <Topic title="Swipe right = Yes">
            <p>
              In the answer phase, swipe right on the card to mark it correct. A green glow appears
              to confirm the action.
            </p>
          </Topic>
          <Topic title="Swipe left = No">
            <p>
              In the answer phase, swipe left on the card to mark it wrong. A red glow appears to
              confirm the action.
            </p>
          </Topic>
        </div>
      </HelpCard>
    </>
  );
}
