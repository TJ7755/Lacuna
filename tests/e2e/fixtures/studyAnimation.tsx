import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { domAnimation, LazyMotion } from 'motion/react';
import { StudyGradeButton } from '../../../apps/web/src/pages/learn/StudyGradeButton';
import {
  StudyCardTransition,
  type StudyCardTransitionHandle,
} from '../../../apps/web/src/pages/learn/StudyCardTransition';
import { SessionSegments } from '../../../apps/web/src/pages/learn/SessionSegments';

export type Scene = 'grade' | 'rim' | 'segments';
interface Model {
  active: boolean;
  index: number;
  m: number;
  serial: number;
}
let updateModel: (patch: Partial<Model>) => void;
let departure: StudyCardTransitionHandle | null;
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
