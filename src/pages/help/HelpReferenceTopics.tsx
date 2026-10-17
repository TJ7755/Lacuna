import { CardsIcon, ImageIcon, InfoIcon, SparklesIcon } from '../../components/ui/icons';
import { HelpCard, HelpIntro, Topic } from './HelpUi';

export function CourseTopics() {
  return (
    <HelpCard>
      <HelpIntro>
        Lacuna organises material into courses. Each course is made up of lessons, studied in order
        along a path.
      </HelpIntro>
      <div>
        <Topic title="Courses">
          <p>
            A course is the top-level subject you are studying &mdash; a module, a subject, an exam.
            Today lists your courses; opening one takes you to its path. A course with a single
            lesson skips the path and opens straight into that lesson.
          </p>
        </Topic>
        <Topic title="The course path">
          <p>
            The path is an ordered sequence of lessons. Completing a lesson unlocks the next one.
            Alongside lessons, the path can show:
          </p>
          <ul>
            <li>
              <strong className="text-ink">Checkpoints:</strong> markers for exam dates you have set
              on the course. Open one to inspect its scope and start an assessment revision plan.
              Checkpoints never block course progress.
            </li>
            <li>
              <strong className="text-ink">Card practice:</strong> stops that gather up due cards
              from the lessons studied so far, so you keep reviewing older material as you move
              through the course.
            </li>
            <li>
              <strong className="text-ink">Practice questions:</strong> a question set placed after
              a lesson, opened straight from the path.
            </li>
          </ul>
        </Topic>
        <Topic title="Lessons and notes">
          <p>
            A lesson holds the notes and cards for one topic. Notes are Markdown blocks where you
            write out explanations, examples or source material &mdash; add, reorder and edit them
            directly on the lesson page. Add further lessons from the course path, from course
            settings under Lessons, or from Add on a single-lesson course in Edit. Cards are the
            flashcards you actually get quizzed on; create them from the lesson page or the
            course&apos;s Cards tab.
          </p>
        </Topic>
        <Topic title="Cards">
          <p>
            Every course has a Cards tab listing all of its cards in one place, regardless of which
            lesson they belong to. Use it to browse, search, edit or bulk-manage cards.
          </p>
        </Topic>
        <Topic title="Course settings">
          <p>
            Course settings hold exam dates, the study objective, scheduling optimisation, lessons
            and Card practice, and course deletion. Full backup and recovery lives in global
            Settings; course sharing lives under Share.
          </p>
        </Topic>
      </div>
    </HelpCard>
  );
}

export function ProgressTopics() {
  return (
    <HelpCard>
      <HelpIntro>
        Understanding the progress bar and scheduling helps you use Lacuna more effectively.
      </HelpIntro>
      <div>
        <Topic title="What the progress bar means">
          <p>
            The progress bar shows how close your course is to being exam-ready. The exact meaning
            depends on your exam objective:
          </p>
          <ul>
            <li>
              <strong className="text-ink">Secure topics:</strong> the fraction of cards that are
              predicted to be retrievable at 90% or above on exam day.
            </li>
            <li>
              <strong className="text-ink">Maximise expected marks:</strong> the mean predicted
              retrievability across all cards on exam day.
            </li>
          </ul>
        </Topic>
        <Topic title="FSRS scheduling">
          <p>
            Lacuna uses FSRS (Free Spaced Repetition Scheduler), an open-source algorithm that
            models your memory with mathematical precision. It tracks how well you know each card
            and schedules reviews at the optimal moment: just before you would forget, but not so
            often that it wastes time.
          </p>
          <p>
            The algorithm adapts to you. Over time, cards you find easy will be shown less
            frequently, while cards you struggle with will come back sooner.
          </p>
        </Topic>
        <Topic title="Optimisation">
          <p>
            Lacuna can fit the FSRS weights to your own review history. This is where most of the
            efficiency gains come from. You can run this manually per course in Course Settings
            &rarr; Scheduling optimisation, or enable automatic optimisation in Settings &rarr;
            Study &amp; scheduling.
          </p>
        </Topic>
      </div>
    </HelpCard>
  );
}

export function ContentTopics() {
  return (
    <>
      <HelpCard id="card-types" icon={<CardsIcon width={18} height={18} />} title="Card types">
        <HelpIntro>Lacuna supports several card types for different kinds of learning.</HelpIntro>
        <div>
          <Topic title="Basic card">
            <p>
              A simple front-and-back flashcard. The question appears on the front; the answer on
              the back. This is the default and works for most material.
            </p>
          </Topic>
          <Topic title="Reversed card">
            <p>
              Creates two cards from one note: one in each direction. Useful for vocabulary
              (English-to-French and French-to-English) or any bidirectional knowledge.
            </p>
          </Topic>
          <Topic title="Typing-answer card">
            <p>
              You type the answer into a text box before revealing. This is more demanding than
              simply recalling, and is excellent for spelling, formulae, or precise terminology.
            </p>
          </Topic>
          <Topic title="Cloze card">
            <p>
              A sentence with one or more words hidden. You recall the hidden words before revealing
              them. Useful for context-dependent knowledge and fill-in-the-blank style questions.
            </p>
          </Topic>
          <Topic title="Audio card">
            <p>
              Attach or record a short clip, add an optional prompt and provide the answer. Audio
              plays on the question face and disappears when the answer is revealed; choose Hear it
              again or press R to replay without losing the grading controls. Autoplay and playback
              speed are under Settings &rarr; Study &amp; scheduling.
            </p>
          </Topic>
          <Topic title="Diagram card">
            <p>
              Generated from a labelled diagram: the labels are covered and one is ringed for you to
              recall. See Diagrams below.
            </p>
          </Topic>
        </div>
      </HelpCard>

      <HelpCard id="questions" icon={<InfoIcon width={18} height={18} />} title="Questions">
        <HelpIntro>
          Questions are exam-style problems with mark schemes, kept separate from recall cards. Open
          a course&apos;s Questions tab to write or practise them. A question set can also sit on
          the course path as a Practice questions stop; questions never appear in card study, Card
          practice or assessment revision.
        </HelpIntro>
        <div>
          <Topic title="Fixed and generated Questions">
            <p>
              A fixed Question always presents the authored problem. A generated family creates
              deterministic variants from one built-in configuration. Every Question names one
              Primary skill practised and may name prerequisite Concepts.
            </p>
          </Topic>
          <Topic title="Practice and marking">
            <p>
              Practise 10 serves due Questions first, then unseen Questions where space remains; All
              due serves every eligible Question currently due. Lacuna marks numeric and structured
              working answers automatically. Full marks schedule as Good, incomplete answers as
              Again, and uncertain or disputed results do not change the schedule.
            </p>
          </Topic>
          <Topic title="Attempts and feedback">
            <p>
              Each presentation records its exact problem before display. Your first submission is
              preserved, worked feedback is always shown, and an optional correction is stored
              separately. Undo excludes the Attempt from scheduling without deleting its receipt.
              Question evidence never changes Card schedules or Card analytics.
            </p>
          </Topic>
        </div>
      </HelpCard>

      <HelpCard id="sequences" icon={<SparklesIcon width={18} height={18} />} title="Sequences">
        <HelpIntro>
          A sequence is an ordered list you write once — a list of steps, dates, or items in a
          series — from which Lacuna generates ordinary cards for you. You never study the sequence
          itself; you study the cards it produces, and editing the sequence keeps them in sync.
        </HelpIntro>
        <div>
          <Topic title="Cue window">
            <p>
              Each generated card’s front shows the preceding item or two (the cue window, two by
              default) so you recall the next item from local context, rather than the whole list.
              This targets the point in a list you are most likely to forget: the middle.
            </p>
          </Topic>
          <Topic title="Chunks">
            <p>
              Long sequences can be split into named chunks. The first item of a chunk is cued by
              its chunk name rather than by the previous chunk’s items, so chunks study
              independently of one another.
            </p>
          </Topic>
          <Topic title="Reciting poems, speeches and scripts">
            <p>
              Simple Learn teaches a poem, speech or script by recitation. Each new line is shown
              once; you then recite every line so far from memory, typed or aloud, and mark any you
              got wrong. Lines are learnt in chunks (stanzas, or four lines unless you choose
              otherwise); after each chunk you recite everything from the top. In later reviews, a
              due line is recited from the start of its chunk.
            </p>
          </Topic>
          <Topic title="Label cards">
            <p>
              Turning on label cards additionally generates an unordered label-to-value card for
              each item (for example, “Atomic number 11 &rarr; ?”), for recall that does not depend
              on position in the sequence at all.
            </p>
          </Topic>
          <Topic title="Editing generated cards">
            <p>
              Cards generated from a sequence are read-only in the card editor and carry a sequence
              badge wherever they appear. To change their content, edit the sequence itself — Lacuna
              regenerates the affected cards and keeps their memory state intact.
            </p>
          </Topic>
        </div>
      </HelpCard>

      <HelpCard id="occlusions" icon={<ImageIcon width={18} height={18} />} title="Diagrams">
        <HelpIntro>
          Upload a labelled diagram, draw boxes over it once, and Lacuna generates one card per box.
          As with sequences, you study the cards rather than the diagram itself, and editing the
          diagram keeps them in sync.
        </HelpIntro>
        <div>
          <Topic title="Labels and features">
            <p>
              A <strong className="text-ink">label</strong> box covers text already printed on the
              diagram — you type nothing, and revealing uncovers the diagram&rsquo;s own words. A{' '}
              <strong className="text-ink">feature</strong> box points at a part of the drawing that
              carries no printed label; pair it with the label box that names it, and revealing
              uncovers that label. Every label is covered on every question face, so no card can be
              answered by reading the picture or by elimination.
            </p>
          </Topic>
          <Topic title="Editing a diagram">
            <p>
              Moving, resizing or re-pairing a box updates that card and keeps its memory state;
              deleting a box removes its card, with an undo. Replacing the image itself regenerates
              every card in the diagram, so Lacuna warns you first. Drawing is designed for a mouse
              or trackpad — it works on a touchscreen, but a larger screen is easier.
            </p>
          </Topic>
          <Topic title="Sharing a diagram">
            <p>
              Share codes cannot carry image or audio files, so a shared diagram card arrives as
              text with no picture. Share → Other ways → Course file preserves the diagram and its
              image when moving a course between devices. Use a full backup from Settings to move
              every course and its study history.
            </p>
          </Topic>
        </div>
      </HelpCard>
    </>
  );
}

export function TipsTopics() {
  return (
    <HelpCard>
      <Topic title="Set an exam date">
        <p>
          The single most important thing you can do is set an accurate exam date and time for each
          course. Without it, Lacuna defaults to a generic rolling horizon and will not prioritise
          the cards that matter most. The exam date is set in Course Settings.
        </p>
      </Topic>
      <Topic title="Keep cards small">
        <p>
          Each card should test one atomic fact. Complex cards that require multiple steps are
          harder to remember and harder to grade. If a card keeps failing, split it.
        </p>
      </Topic>
      <Topic title="Be honest when grading">
        <p>
          The algorithm is only as good as your self-assessment. If you were not sure, mark it
          wrong. It is better to review a card one extra time than to forget it on exam day.
        </p>
      </Topic>
      <Topic title="Use the Pomodoro timer">
        <p>
          The built-in Pomodoro timer helps you maintain focus. Short breaks prevent fatigue, which
          improves retention. You can customise the durations in Settings &rarr; Pomodoro timer.
        </p>
      </Topic>
      <Topic title="Export your data regularly">
        <p>
          All your data lives locally in your browser. Use the automatic backups feature (Settings
          &rarr; Automatic backups) or export your data manually to keep a safe copy.
        </p>
      </Topic>
    </HelpCard>
  );
}
