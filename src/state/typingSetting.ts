import { useEffect, useState } from 'react';

/**
 * How the answer is given during Learn mode's question phase.
 *  - `reveal`: the default flip-card flow — tap/press to reveal the answer.
 *  - `type`: the learner types their answer before reveal; on reveal it is compared
 *    against the expected answer (see src/utils/answerComparison.ts) and shown
 *    alongside the correct answer. Self-grading still decides the FSRS grade.
 *
 * This was previously a per-card type ('typing'); it is now a global presentation
 * mode so any eligible card (front_back, basic_reversed, cloze) can be answered by
 * typing without needing a dedicated card type.
 */
export type TypingSetting = 'reveal' | 'type';

const KEY = 'lacuna.typingSetting';

export function readTypingSetting(): TypingSetting {
  return localStorage.getItem(KEY) === 'type' ? 'type' : 'reveal';
}

export function writeTypingSetting(mode: TypingSetting): void {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent('lacuna:typing-setting', { detail: mode }));
}

export function useTypingSetting(): [TypingSetting, (mode: TypingSetting) => void] {
  const [mode, setMode] = useState<TypingSetting>(() => readTypingSetting());

  useEffect(() => {
    const onChange = () => setMode(readTypingSetting());
    window.addEventListener('storage', onChange);
    window.addEventListener('lacuna:typing-setting', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('lacuna:typing-setting', onChange);
    };
  }, []);

  return [
    mode,
    (next) => {
      writeTypingSetting(next);
      setMode(next);
    },
  ];
}
