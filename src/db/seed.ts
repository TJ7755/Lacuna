// First-run seed data: one small, deletable example course so the app is never empty.

import { db, makeId } from './schema';
import type { Card, Course, CourseAssessment, Lesson, Note, Deck } from './types';
import { courseToRecord } from './assessmentMigration';
import { emptyPerformance } from '../fsrs/grading';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { defaultExamDate } from '../utils/datetime';
import { assetUrl, sha256Blob } from './assets';

const FLAG_KEY = 'lacuna-seeded';
let seeding = false;

/** A lesson and the backing deck its cards are recorded against (see ensureLessonDeck). */
interface SeedLesson {
  lesson: Lesson;
  deck: Deck;
}

function exampleCard(
  deckId: string,
  courseId: string,
  lessonId: string,
  type: Card['type'],
  front: string,
  back: string,
  tags?: string[],
  /** Milliseconds offset from base time so every card has a distinct createdAt. */
  timeOffset = 0,
): Card {
  return {
    id: makeId(),
    deckId,
    courseId,
    primaryLessonId: lessonId,
    type,
    front,
    back,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    tags: tags ?? [],
    createdAt: Date.now() + timeOffset,
    suspended: false,
    flagged: false,
    buriedUntil: null,
  };
}

/** Build an ImageAsset record from an inline SVG string without writing to the database yet. */
async function prepareSvgAsset(svg: string, width: number, height: number) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const hash = await sha256Blob(blob);
  return {
    record: {
      hash,
      blob,
      mimeType: 'image/svg+xml' as const,
      width,
      height,
      createdAt: Date.now(),
    },
    url: assetUrl(hash),
  };
}

const FORGETTING_CURVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
  <line x1="30" y1="130" x2="300" y2="130" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <line x1="30" y1="130" x2="30" y2="20" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <text x="16" y="25" font-size="10" fill="currentColor" opacity="0.6">R</text>
  <text x="16" y="135" font-size="10" fill="currentColor" opacity="0.6">t</text>
  <path d="M 30 30 Q 120 45 200 85 T 300 125" fill="none" stroke="currentColor" stroke-width="2" opacity="0.8"/>
  <line x1="30" y1="45" x2="300" y2="45" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
  <text x="305" y="40" font-size="9" fill="currentColor" opacity="0.6">0.90</text>
</svg>`;

const SAMPLE_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
  <rect x="10" y="20" width="180" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <circle cx="60" cy="55" r="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <polyline points="90,90 115,60 140,80 175,40" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
</svg>`;

/**
 * Build a lesson plus the hidden backing deck its cards are recorded against, mirroring
 * `ensureLessonDeck` in repository.ts (recordReview and userPerformance key off deckId,
 * so every lesson still needs one deck under the hood even though the UI is course/lesson-based).
 */
function makeSeedLesson(
  course: Course,
  name: string,
  description: string,
  orderIndex: number,
  timeOffset: number,
): SeedLesson {
  const createdAt = Date.now() + timeOffset;
  const lesson: Lesson = {
    id: makeId(),
    courseId: course.id,
    name,
    description,
    orderIndex,
    createdAt,
    isExtension: false,
  };
  const deck: Deck = {
    id: makeId(),
    name,
    examDate: course.examDate,
    timeZone: course.timeZone,
    createdAt,
    fsrsVersion: course.fsrsVersion,
    fsrsParameters: course.fsrsParameters,
    examObjective: course.examObjective,
    lastInteractedAt: createdAt,
    colour: course.colour,
  };
  return { lesson, deck };
}

/**
 * True only on a genuinely fresh browser: nothing seeded and no courses in the
 * database. Checked before seedIfFirstRun runs (seeding creates a course, so
 * afterwards this can never be true again).
 */
export async function isFirstRun(): Promise<boolean> {
  try {
    if (localStorage.getItem(FLAG_KEY)) return false;
  } catch {
    // localStorage may be unavailable; fall through to the database check.
  }
  return (await db.courses.count()) === 0;
}

/** Seed the example course exactly once per browser, and only if the database is empty. */
export async function seedIfFirstRun(): Promise<void> {
  if (seeding) return;
  seeding = true;
  try {
    // Fast-path: if any course already exists, skip seeding entirely.
    const existingCourseCount = await db.courses.count();
    if (existingCourseCount > 0) {
      // Best-effort sync of the localStorage flag so future starts are cheaper.
      try {
        localStorage.setItem(FLAG_KEY, '1');
      } catch {
        // localStorage may be unavailable; next start will retry the check.
      }
      return;
    }

    const createdAt = Date.now();
    const course: Course = {
      id: makeId(),
      name: 'Welcome to Lacuna',
      description: 'A short tour of Lacuna, taught the way you will actually use it.',
      createdAt,
      colour: '#0d9488',
      examDate: defaultExamDate(createdAt),
      fsrsVersion: FSRS_VERSION,
      fsrsParameters: defaultFsrsParameters(),
      examObjective: 'expectedMarks',
      lastInteractedAt: createdAt,
      unlockMode: 'open',
      autoPractice: true,
      practiceThresholdMinutesFar: 8,
      practiceThresholdMinutesNear: 4,
      practiceUrgentWindowDays: 7,
      practiceMaxGap: 2,
    };

    const [fcAsset, sampleAsset] = await Promise.all([
      prepareSvgAsset(FORGETTING_CURVE_SVG, 320, 160),
      prepareSvgAsset(SAMPLE_IMAGE_SVG, 200, 120),
    ]);

    const lessonCore = makeSeedLesson(
      course,
      'Core concepts & rendering',
      'What Lacuna is built on: the forgetting curve, FSRS, and how cards render.',
      0,
      0,
    );
    const lessonScheduling = makeSeedLesson(
      course,
      'Scheduling philosophy',
      'How Lacuna schedules towards an exam date instead of just spacing intervals.',
      1,
      1,
    );
    const lessonLearn = makeSeedLesson(
      course,
      'Learn mode & grading',
      'How a study session works, from revealing an answer to grading it.',
      2,
      2,
    );
    const lessonAdvanced = makeSeedLesson(
      course,
      'Data, sharing & advanced features',
      'Search, backups, sharing courses, and the smaller features worth knowing about.',
      3,
      3,
    );
    const seedLessons = [lessonCore, lessonScheduling, lessonLearn, lessonAdvanced];
    const finalAssessment: CourseAssessment = {
      id: makeId(),
      courseId: course.id,
      name: 'Final exam',
      kind: 'final',
      examDate: course.examDate,
      afterLessonId: lessonAdvanced.lesson.id,
      coverageMode: 'prefix',
      excludedCardIds: [],
      createdAt,
    };

    const notes: Note[] = [
      {
        id: makeId(),
        lessonId: lessonCore.lesson.id,
        name: 'Why spaced repetition',
        content:
          'Every card you study has a **retrievability** — the probability you could recall it right now — ' +
          'which decays over time since your last review. Lacuna schedules each review to catch that decay ' +
          'just before it costs you the card, using the FSRS-6 model for stability and difficulty.\n\n' +
          "Notes like this one live alongside a lesson's cards. Write explanations or source material here, " +
          'then generate or add cards for the parts you actually need to be quizzed on.',
        orderIndex: 0,
        createdAt: Date.now() + 4,
      },
      {
        id: makeId(),
        lessonId: lessonScheduling.lesson.id,
        name: 'Studying towards a date',
        content:
          'Classic spaced repetition asks "when is this card next due?" Lacuna asks "what will this card\'s ' +
          'retrievability be **on the exam date**?" Set an accurate exam date in Course Settings and every ' +
          'review is chosen to maximise your predicted score on that day.',
        orderIndex: 0,
        createdAt: Date.now() + 5,
      },
    ];

    const cards: Card[] = [
      // Core concepts & rendering
      exampleCard(
        lessonCore.deck.id,
        course.id,
        lessonCore.lesson.id,
        'front_back',
        'What does the **forgetting curve** describe?',
        `How retrievability of a memory **decays over time** since the last review. Lacuna uses the FSRS-6 model:\n\n\`R(t, S) = (1 + factor·(t/S))^decay\`, where \`factor = 0.9^(1/decay) − 1\` and \`decay = −w20\`.\n\n![Forgetting curve](${fcAsset.url})`,
        ['fsrs', 'theory'],
        10,
      ),
      exampleCard(
        lessonCore.deck.id,
        course.id,
        lessonCore.lesson.id,
        'cloze',
        'The chemical symbol for water is {{c1::H2O}}.',
        '',
        ['chemistry', 'basics'],
        11,
      ),
      exampleCard(
        lessonCore.deck.id,
        course.id,
        lessonCore.lesson.id,
        'cloze',
        'In spaced repetition, the two state variables FSRS tracks are {{c1::stability::how long a memory lasts}} and {{c2::difficulty::how hard a card is}}.',
        '',
        ['fsrs', 'theory'],
        12,
      ),
      exampleCard(
        lessonCore.deck.id,
        course.id,
        lessonCore.lesson.id,
        'front_back',
        'Write the quadratic formula.',
        'For $ax^2 + bx + c = 0$:\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$',
        ['maths', 'formulae'],
        13,
      ),
      exampleCard(
        lessonCore.deck.id,
        course.id,
        lessonCore.lesson.id,
        'front_back',
        'What is the derivative of $e^x$ with respect to $x$?',
        '$$\\frac{d}{dx} e^x = e^x$$',
        ['maths', 'calculus'],
        14,
      ),

      // Scheduling philosophy
      exampleCard(
        lessonScheduling.deck.id,
        course.id,
        lessonScheduling.lesson.id,
        'front_back',
        'How does Lacuna differ from classic spaced repetition?',
        'Classic SRS asks "when is this card next due?" Lacuna asks "what will this card\'s retrievability be on the **exam date**?" Every review is chosen to maximise your predicted score on exam day, not merely to space intervals.',
        ['scheduling', 'philosophy'],
        15,
      ),
      exampleCard(
        lessonScheduling.deck.id,
        course.id,
        lessonScheduling.lesson.id,
        'front_back',
        'What are the two exam objectives a course can use?',
        '1. **Maximise expected marks** — maximise the mean predicted retrievability across all cards.\n2. **Secure topics** — maximise the fraction of cards whose predicted retrievability is at least 0.90.\n\nYou can switch between them in Course Settings.',
        ['scheduling', 'objectives'],
        16,
      ),
      exampleCard(
        lessonScheduling.deck.id,
        course.id,
        lessonScheduling.lesson.id,
        'front_back',
        'How does assessment revision work?',
        'Choose a named checkpoint or final assessment from the course path or **Study now**. Lacuna creates a persistent, time-budgeted plan over reached and studied cards in that assessment’s coverage, respecting exclusions. Cards are ranked by predicted assessment-day value; invalid model data uses ordinary Practice ordering.',
        ['scheduling', 'revision'],
        17,
      ),
      exampleCard(
        lessonScheduling.deck.id,
        course.id,
        lessonScheduling.lesson.id,
        'front_back',
        'What does a course path show alongside its lessons?',
        '**Checkpoints** — markers for exam dates you have set, informational and never blocking progress — and **practice sessions**, nodes that gather due cards from lessons studied so far so you keep reviewing older material as you move through the course.',
        ['course-path', 'practice'],
        18,
      ),

      // Learn mode & grading
      exampleCard(
        lessonLearn.deck.id,
        course.id,
        lessonLearn.lesson.id,
        'front_back',
        'What happens when you press "Yes" with silent grading enabled?',
        'An **invisible timer** measures how long you took from revealing the answer to pressing Yes. Lacuna maps your speed to an FSRS grade: fast responses become **Easy**, average become **Good**, and slow become **Hard**. Only "No" maps directly to **Again**.',
        ['learn', 'grading'],
        19,
      ),
      exampleCard(
        lessonLearn.deck.id,
        course.id,
        lessonLearn.lesson.id,
        'front_back',
        'How can you switch from silent to manual grading?',
        'Go to **Settings → Study & scheduling** and enable **manual four-point grading**. When enabled, a study session shows **Again / Hard / Good / Easy** buttons instead of Yes / No.',
        ['learn', 'grading'],
        20,
      ),
      exampleCard(
        lessonLearn.deck.id,
        course.id,
        lessonLearn.lesson.id,
        'cloze',
        'During a study session, press {{c1::Space}} or {{c2::Up}} to reveal the answer. Press {{c3::Right}} for Yes and {{c4::Left}} for No. Press {{c5::E}} to edit the card, {{c6::U}} to undo, {{c7::F}} for focus mode, and {{c8::?}} for help.',
        '',
        ['learn', 'shortcuts'],
        21,
      ),
      exampleCard(
        lessonLearn.deck.id,
        course.id,
        lessonLearn.lesson.id,
        'front_back',
        'What actions can you take on a card during a study session?',
        'From the card menu: **Edit** the card in-place, **Flag** it for later attention, **Bury** it until tomorrow, or **Suspend** it indefinitely. You can also **Undo** your last answer with **U**.',
        ['learn', 'actions'],
        22,
      ),
      exampleCard(
        lessonLearn.deck.id,
        course.id,
        lessonLearn.lesson.id,
        'front_back',
        'What is Simple learn mode?',
        'A stripped-back mode with no algorithm. Every card in the course is shown; a correct answer marks it mastered, an incorrect one sends it to the back of the queue. The session ends once every card has been answered correctly.',
        ['learn', 'modes'],
        23,
      ),

      // Data, sharing & advanced features
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'How can you find content across all your courses?',
        'Open **Search** from the sidebar or press **Ctrl+K** for the command palette. Both search courses, lessons, notes and cards together, and the card list can be filtered by **due**, **new**, **leech**, **flagged**, and **suspended**.',
        ['search', 'navigation'],
        24,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'How can you share a course with someone else?',
        "Go to the **Share** page, select a course, and generate a compact **share code**. It carries the course's lessons, notes and cards, but not review history or images. The recipient pastes the code to add it as a new course of their own.",
        ['share', 'export'],
        25,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'How is your data protected?',
        'Lacuna stores everything **locally** in your browser. Automatic **restore points** are taken daily. You can also **export** everything to a JSON file, or use **folder mirroring** (where supported) to write backups to disk.',
        ['backup', 'privacy'],
        26,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'What is the question bank?',
        'Every course has a **question bank** listing all of its cards in one place, regardless of which lesson they belong to. Use it to browse, search, edit or bulk-manage cards, or add cards that are not tied to a specific lesson.',
        ['course-model', 'question-bank'],
        27,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Did you know: FSRS parameters can be personalised?',
        "Lacuna can **optimise** a course's FSRS weights by training them on your own review history. Run it manually from **Course Settings → Scheduling optimisation**, or enable automatic optimisation in Settings. It only applies after confirming an improvement in prediction accuracy.",
        ['optimisation', 'advanced'],
        28,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'What is a leech card?',
        'A card with **8 or more lapses** by default is flagged as a **leech**. Lacuna surfaces it with a badge and a search filter; the threshold and what happens automatically (suspend, tag, or nothing) are configurable per course in Course Settings.',
        ['leech', 'advanced'],
        29,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'What happens when you add tags to a card?',
        'Tags let you filter the card list in the question bank. The active tag also narrows a **study session** to only cards with that tag. Try selecting a tag and then pressing Study.',
        ['tags', 'organisation'],
        30,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Can you create a card that tests both directions?',
        'Yes. When creating a basic card, choose the **reversed** type. Lacuna generates an independent second card with the front and back swapped, so you are tested on the relationship in both directions.',
        ['cards', 'editor'],
        31,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Did you know: failed cards are temporarily deferred?',
        'If you answer "No", the card enters a **cooldown** so it is not shown again immediately. This gives you a chance to see other cards before retrying it.',
        ['learn', 'cooldown'],
        32,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Did you know: the dashboard tracks your study streak?',
        'The dashboard shows your current **study streak** and a **review heatmap** — a calendar grid of how many cards you reviewed each day across all your courses.',
        ['dashboard', 'stats'],
        33,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Did you know: you can import cards from a spreadsheet?',
        "From a lesson or the question bank, choose **Import**. Lacuna accepts **CSV** or **TSV** files (and Anki's plain-text export) with front, back, and optional tags. Cloze notation in a single column is recognised automatically.",
        ['import', 'data'],
        34,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Did you know: cards can include images?',
        `Paste or drag an image into the editor and it is stored as a binary asset, referenced in Markdown as \`lacuna-asset://<hash>\`. Identical images are deduplicated by hash so they are only stored once.\n\n![Sample embedded image](${sampleAsset.url})`,
        ['images', 'editor'],
        35,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Did you know: the interface is fully themeable?',
        'In **Settings** you can switch between light and dark mode, pick from **seven accent colours**, and adjust the **text size** in steps. Your choices persist across sessions.',
        ['appearance', 'customisation'],
        36,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Did you know: you can cap new cards per day?',
        'In **Course Settings**, set a **new cards per day** cap to ration brand-new material. The dashboard denominator stays honest while your daily session paces itself.',
        ['settings', 'scheduling'],
        37,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Did you know: target retention is adjustable?',
        'The **target retention** slider in Course Settings lets you choose between **0.80** (relaxed) and **0.97** (thorough). A higher value means more reviews but stronger memories on exam day.',
        ['settings', 'fsrs'],
        38,
      ),
      exampleCard(
        lessonAdvanced.deck.id,
        course.id,
        lessonAdvanced.lesson.id,
        'front_back',
        'Did you know: Lacuna requests persistent storage?',
        'On first run the app asks the browser for **persistent storage** so your data is not silently evicted. Check the result in **Settings**; if denied, regular exports or folder mirroring are your safeguard.',
        ['settings', 'privacy'],
        39,
      ),
    ];

    await db.transaction(
      'rw',
      [
        db.courses,
        db.courseAssessments,
        db.lessons,
        db.notes,
        db.decks,
        db.cards,
        db.userPerformance,
        db.assets,
      ],
      async () => {
        const courseCount = await db.courses.count();
        if (courseCount > 0) return;
        await db.courses.add(courseToRecord(course));
        await db.courseAssessments.add(finalAssessment);
        await db.lessons.bulkAdd(seedLessons.map((s) => s.lesson));
        await db.notes.bulkAdd(notes);
        await db.decks.bulkAdd(seedLessons.map((s) => s.deck));
        await db.cards.bulkAdd(cards);
        await db.userPerformance.bulkAdd(seedLessons.map((s) => emptyPerformance(s.deck.id)));
        await db.assets.bulkAdd([fcAsset.record, sampleAsset.record]);
      },
    );

    // Only set the flag after a successful commit so a failed seed is retried.
    try {
      localStorage.setItem(FLAG_KEY, '1');
    } catch {
      // localStorage may be unavailable; the next start will retry the check.
    }
  } finally {
    seeding = false;
  }
}
