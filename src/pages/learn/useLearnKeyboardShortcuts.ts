import { useEffect } from 'react';
import type { Card, Grade } from '../../db/types';
import { keyMatches, type ShortcutBindings } from '../../state/shortcutBindings';
import type { GradingMode } from '../../state/gradingMode';
import type { Phase } from './types';

export interface UseLearnKeyboardShortcutsParams {
  phase: Phase;
  reveal: () => void;
  hide: () => void;
  answer: (input: boolean | Grade, source?: 'touch' | 'keyboard') => void;
  canUndo: boolean;
  isLinesModeCard: boolean;
  hintStep: 0 | 1 | 2;
  setHintStep: (updater: (step: 0 | 1 | 2) => 0 | 1 | 2) => void;
  undoLast: () => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  editing: boolean;
  current: Card | null;
  isTypingCard: boolean;
  isNumericCard: boolean;
  openEdit: () => void;
  hintsOpen: boolean;
  setHintsOpen: (open: boolean) => void;
  gradingMode: GradingMode;
  bindings: ShortcutBindings;
  m: number;
  focusMode: boolean;
  setFocusMode: (value: boolean | ((value: boolean) => boolean)) => void;
  setFocusChromeVisible: (visible: boolean) => void;
}

/**
 * Learn mode's global keyboard shortcuts (see the effect body below for the exact
 * key -> action map). Extracted from LearnMode.tsx as a self-contained unit (see
 * next_plan.md Arc 11 slice-1 Task 0) — a pure behaviour relocation, no logic changed.
 *
 * Keyboard shortcuts:
 *   question - Space or ArrowUp reveals the answer.
 *   answer   - silent mode uses Y/N or ArrowRight/ArrowLeft; manual mode uses 1-4.
 *   any time - E edits the current card; U undoes the last answer (when available).
 */
export function useLearnKeyboardShortcuts({
  phase,
  reveal,
  hide,
  answer,
  canUndo,
  isLinesModeCard,
  hintStep,
  setHintStep,
  undoLast,
  navOpen,
  setNavOpen,
  menuOpen,
  setMenuOpen,
  editing,
  current,
  isTypingCard,
  isNumericCard,
  openEdit,
  hintsOpen,
  setHintsOpen,
  gradingMode,
  bindings,
  m,
  focusMode,
  setFocusMode,
  setFocusChromeVisible,
}: UseLearnKeyboardShortcutsParams) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // While the user is typing into any input, textarea, or content-editable
      // element, card shortcuts stay inert so keystrokes don't accidentally grade.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        // Allow Enter in the typing input to submit the answer.
        if (target.tagName === 'INPUT' && e.key === 'Enter' && isTypingCard) {
          e.preventDefault();
          reveal();
          return;
        }
        return;
      }
      // The edit overlay owns the keyboard entirely while open, so typing into it
      // never reveals or grades the card underneath.
      if (editing) return;
      // The help overlay only listens for ? / Escape to close itself.
      if (hintsOpen) {
        if (e.key === '?' || e.key === 'Escape') {
          e.preventDefault();
          setHintsOpen(false);
        }
        return;
      }
      // While the nav drawer is open, only Escape (to close it) is meaningful;
      // card shortcuts stay inert so navigating doesn't grade the current card.
      if (navOpen) {
        if (e.key === 'Escape') setNavOpen(false);
        return;
      }
      if (menuOpen && e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (focusMode && e.key === 'Escape') {
        e.preventDefault();
        setFocusMode(false);
        setFocusChromeVisible(false);
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setHintsOpen(true);
        return;
      }
      if (e.key === 'h' && phase === 'question' && isLinesModeCard && hintStep < 2) {
        e.preventDefault();
        setHintStep((s) => (s < 2 ? ((s + 1) as 1 | 2) : s));
        return;
      }
      if (keyMatches(e, bindings.focus)) {
        e.preventDefault();
        setFocusMode((v) => !v);
        return;
      }
      if (
        keyMatches(e, bindings.edit) &&
        current &&
        current.sequenceItemId === undefined &&
        (phase === 'question' || phase === 'answer')
      ) {
        e.preventDefault();
        openEdit();
        return;
      }
      if (keyMatches(e, bindings.undo) && canUndo) {
        e.preventDefault();
        void undoLast();
        return;
      }
      if (isNumericCard) return;
      if (phase === 'question' && (keyMatches(e, bindings.reveal) || e.code === 'ArrowUp')) {
        e.preventDefault();
        reveal();
      } else if (phase === 'answer') {
        if (e.code === 'ArrowDown') {
          e.preventDefault();
          hide();
          return;
        }
        if (gradingMode === 'manual') {
          if (keyMatches(e, bindings.again)) {
            e.preventDefault();
            void answer(1);
          } else if (keyMatches(e, bindings.hard)) {
            e.preventDefault();
            void answer(2);
          } else if (keyMatches(e, bindings.good)) {
            e.preventDefault();
            void answer(3);
          } else if (keyMatches(e, bindings.easy)) {
            e.preventDefault();
            void answer(4);
          }
        } else if (keyMatches(e, bindings.yes) || e.code === 'ArrowRight') {
          e.preventDefault();
          void answer(true);
        } else if (keyMatches(e, bindings.no) || e.code === 'ArrowLeft') {
          e.preventDefault();
          void answer(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    phase,
    reveal,
    hide,
    answer,
    canUndo,
    isLinesModeCard,
    hintStep,
    setHintStep,
    undoLast,
    navOpen,
    setNavOpen,
    menuOpen,
    setMenuOpen,
    editing,
    current,
    isTypingCard,
    isNumericCard,
    openEdit,
    hintsOpen,
    setHintsOpen,
    gradingMode,
    bindings,
    m,
    focusMode,
    setFocusMode,
    setFocusChromeVisible,
  ]);
}
