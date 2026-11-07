import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { domAnimation, LazyMotion } from 'motion/react';
import type { Card } from '@lacuna/core/db/types';
// The fixture renders browser components from the application's type environment.
import type {} from '../../../apps/web/src/vite-env';
import { FlipCard } from '../../../apps/web/src/pages/learn/FlipCard';
import { StudyGradeButton } from '../../../apps/web/src/pages/learn/StudyGradeButton';
import {
  StudyCardTransition,
  type StudyCardTransitionHandle,
} from '../../../apps/web/src/pages/learn/StudyCardTransition';
import { SessionSegments } from '../../../apps/web/src/pages/learn/SessionSegments';
import { StepSwap } from '../../../apps/web/src/components/ui/StepSwap';

export type Scene = 'flip' | 'grade' | 'rim' | 'segments' | 'step';
interface Model {
  active: boolean;
  index: number;
  m: number;
  serial: number;
}
let updateModel: (patch: Partial<Model>) => void;
let departure: StudyCardTransitionHandle | null;
const card: Card = {
  id: 'probe',
  conceptId: 'probe',
  deckId: 'probe',
  schedulingUnitId: 'probe',
  type: 'front_back',
  front: 'Question',
  back: 'Answer',
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
};
const cards = Array.from({ length: 322 }, (_, index) => `card-${index}`);

function Harness({
  scene,
  multiplier,
  initialIndex,
}: {
  scene: Scene;
  multiplier: number;
  initialIndex: number;
}) {
  const [model, setModel] = useState<Model>({
    active: false,
    index: initialIndex,
    m: multiplier,
    serial: 0,
  });
  updateModel = (patch) => setModel((current) => ({ ...current, ...patch }));
  let body;
  if (scene === 'flip')
    body = (
      <FlipCard
        card={card}
        revealed={model.active}
        phase={model.active ? 'answer' : 'question'}
        motionSpeed="normal"
        motionMultiplier={model.m}
        isTouchMode={false}
        menuOpen={false}
        editing={false}
        hintsOpen={false}
        onReveal={() => updateModel({ active: true })}
        onHide={() => updateModel({ active: false })}
        onAnswer={() => {}}
        mode="fsrs"
        answerStrictness="standard"
      />
    );
  if (scene === 'grade')
    body = (
      <StudyGradeButton
        grade={true}
        feedback={model.active ? { input: true, serial: model.serial } : undefined}
        m={model.m}
      >
        Yes
      </StudyGradeButton>
    );
  if (scene === 'rim')
    body = (
      <StudyCardTransition
        ref={(value) => {
          departure = value;
        }}
        cardId="probe"
        phase="answer"
        multiplier={model.m}
      >
        <div className="fixture-card">Answer</div>
      </StudyCardTransition>
    );
  if (scene === 'segments')
    body = (
      <SessionSegments
        cardIds={cards}
        currentCardIds={[cards[model.index]]}
        outcomes={new Map()}
        value={0.1}
        label="Session progress"
        m={model.m}
      />
    );
  if (scene === 'step')
    body = (
      <StepSwap stepKey={model.active ? 'next' : 'first'}>
        <div className="fixture-card">{model.active ? 'Next step' : 'First step'}</div>
      </StepSwap>
    );
  return <LazyMotion features={domAnimation}>{body}</LazyMotion>;
}

export function mount(scene: Scene, m = 1, initialIndex = 12) {
  localStorage.setItem('lacuna.motionSpeed', m === 1.4 ? 'slow' : m === 0.6 ? 'fast' : 'normal');
  flushSync(() =>
    createRoot(document.querySelector('#root')!).render(
      <Harness scene={scene} multiplier={m} initialIndex={initialIndex} />,
    ),
  );
}
export function change(patch: Partial<Model>) {
  flushSync(() => updateModel(patch));
}
export function start(scene: Scene) {
  if (scene === 'rim') flushSync(() => departure!.dismiss(true, () => {}));
  else change(scene === 'segments' ? { index: 13 } : { active: true, serial: 1 });
}
export function cancel() {
  flushSync(() => departure?.cancel());
}
