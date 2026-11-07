import { useEffect, useRef } from 'react';
import type { Phase } from './types';

function availableControl(main: HTMLElement, selector: string): HTMLElement | undefined {
  return Array.from(main.querySelectorAll<HTMLElement>(selector)).find(
    (control) => !control.closest('[inert]'),
  );
}

/** A stable return point when grading or editing removes the focused control. */
export function useStudyFocus(
  cardId: string | undefined,
  phase: Phase,
  overlayOpen: boolean,
  continueReady = false,
) {
  const mainRef = useRef<HTMLElement>(null);
  const previous = useRef<{
    cardId?: string;
    phase?: Phase;
    overlayOpen?: boolean;
    continueReady?: boolean;
  }>({});
  useEffect(() => {
    const before = previous.current;
    previous.current = { cardId, phase, overlayOpen, continueReady };
    const changedCard =
      before.cardId !== cardId || (before.phase !== phase && phase === 'question');
    const canContinue = continueReady && !before.continueReady;
    if (overlayOpen || !cardId || (!changedCard && !before.overlayOpen && !canContinue)) return;
    const main = mainRef.current;
    if (!main) return;
    const focused = document.activeElement;
    if (!before.overlayOpen && focused !== document.body && !main.contains(focused)) return;
    const next =
      availableControl(main, '[data-study-continue]') ??
      availableControl(main, '#study-typed-answer, #working-answer') ??
      availableControl(main, '[data-study-reveal-only]') ??
      availableControl(main, '[data-study-choices] input[type="radio"]:checked:not(:disabled)') ??
      availableControl(main, '[data-study-choices] input[type="radio"]:not(:disabled)');
    (next ?? main).focus({ preventScroll: true });
  }, [cardId, phase, overlayOpen, continueReady]);
  return mainRef;
}
