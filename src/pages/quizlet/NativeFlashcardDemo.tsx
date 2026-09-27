import { useRef, useState } from 'react';
import type { Card, Grade } from '../../db/types';
import { generateCards } from '../../db/sequenceGeneration';
import { FlipCard } from '../learn/FlipCard';
import { StudyControls } from '../learn/StudyControls';
import { StudyCardTransition, type StudyCardTransitionHandle } from '../learn/StudyCardTransition';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { Arrow } from './ComparisonUi';
import './NativeFlashcardDemo.css';

const formats = ['Recall', 'Cloze', 'Sequence', 'Type an answer'] as const;
type Format = (typeof formats)[number];
function card(id: string, front: string, back: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    conceptId: id,
    deckId: 'comparison-demo',
    schedulingUnitId: 'comparison-demo',
    type: 'front_back',
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
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}
const recall = [
  card(
    'enzyme',
    'What does an enzyme do?',
    'An enzyme is a **biological catalyst**. It speeds up a reaction by lowering the activation energy.',
  ),
  card(
    'site',
    'What is the name of the region where a substrate binds to an enzyme?',
    'The **active site**.',
  ),
];
const sequence = generateCards({
  id: 'enzyme-sequence',
  courseId: 'comparison-demo',
  primaryLessonId: null,
  name: 'An enzyme-catalysed reaction',
  cueWindow: 1,
  generateLabelCards: false,
  createdAt: 0,
  updatedAt: 0,
  items: [
    'The substrate binds to the active site.',
    'The enzyme catalyses the reaction.',
    'The products leave the active site.',
  ].map((value, i) => ({ id: `enzyme-step-${i}`, value })),
}).map((payload, i) => card(`sequence-${i}`, payload.front, payload.back, payload));
const examples: Record<Format, Card[]> = {
  Recall: recall,
  Cloze: [
    card('cloze', 'Enzymes lower the {{c1::activation energy}} of a reaction.', '', {
      type: 'cloze',
    }),
  ],
  Sequence: sequence,
  'Type an answer': [
    card('typed-site', 'Where does the substrate bind to an enzyme?', 'active site'),
  ],
};

export function NativeFlashcardDemo() {
  const [format, setFormat] = useState<Format>('Recall');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [speed] = useMotionSpeed();
  const transition = useRef<StudyCardTransitionHandle>(null);
  const input = useRef<HTMLInputElement>(null);
  const current = examples[format][index];
  const phase = revealed ? 'answer' : 'question';
  const m = speedMultiplier(speed);
  function choose(next: Format) {
    transition.current?.cancel();
    setFormat(next);
    setIndex(0);
    setRevealed(false);
    setTypedAnswer('');
  }
  function answer(value: boolean | Grade, source?: 'touch' | 'keyboard') {
    transition.current?.dismiss(
      typeof value === 'boolean' ? value : value >= 3,
      () => {
        setIndex((index + 1) % examples[format].length);
        setRevealed(false);
        setTypedAnswer('');
      },
      source,
    );
  }
  return (
    <div className="qc-native-demo">
      <nav className="qc-native-formats" aria-label="Flashcard formats">
        {formats.map((item) => (
          <button key={item} aria-pressed={format === item} onClick={() => choose(item)}>
            {item}
            <Arrow />
          </button>
        ))}
      </nav>
      <div className="qc-native-stage">
        <StudyCardTransition ref={transition} cardId={current.id} phase={phase} multiplier={m}>
          <FlipCard
            card={current}
            revealed={revealed}
            motionSpeed={speed}
            phase={phase}
            isTouchMode={false}
            menuOpen={false}
            editing={false}
            navOpen={false}
            hintsOpen={false}
            onReveal={() => setRevealed(true)}
            onHide={() => setRevealed(false)}
            onAnswer={answer}
            typedAnswer={typedAnswer}
            isTypingCard={format === 'Type an answer'}
            mode="simple"
            answerStrictness="lenient"
          />
        </StudyCardTransition>
        <StudyControls
          phase={phase}
          isTypingCard={format === 'Type an answer'}
          isTouchMode={false}
          gradingMode="silent"
          typedAnswer={typedAnswer}
          typingInputRef={input}
          onTypedAnswer={setTypedAnswer}
          onReveal={() => setRevealed(true)}
          onHide={() => setRevealed(false)}
          onAnswer={answer}
          m={m}
        />
      </div>
    </div>
  );
}
