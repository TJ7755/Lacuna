import { useEffect, useRef } from 'react';
import type { Phase } from './types';

/** A stable return point when grading or editing removes the focused control. */
export function useStudyFocus(cardId: string | undefined, phase: Phase, overlayOpen: boolean) {
  const mainRef = useRef<HTMLElement>(null);
  const previous = useRef<{ cardId?: string; phase?: Phase; overlayOpen?: boolean }>({});
  useEffect(() => {
    const before = previous.current;
    previous.current = { cardId, phase, overlayOpen };
    const changedCard =
      before.cardId !== cardId || (before.phase !== phase && phase === 'question');
    if (overlayOpen || !cardId || (!changedCard && !before.overlayOpen)) return;
    const main = mainRef.current;
    if (!main) return;
    const focused = document.activeElement;
    if (!before.overlayOpen && focused !== document.body && !main.contains(focused)) return;
    const answer = main.querySelector<HTMLInputElement>('#study-typed-answer');
    (answer ?? main).focus({ preventScroll: true });
  }, [cardId, phase, overlayOpen]);
  return mainRef;
}
