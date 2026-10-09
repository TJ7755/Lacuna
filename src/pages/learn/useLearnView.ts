import { useCallback, useEffect, useRef, useState } from 'react';
import type { useToast } from '../../components/ui/Toast';

/**
 * Learn mode's view state: focus mode and its chrome, full screen, the card menu, the
 * shortcuts cheatsheet, the navigation drawer and the typed answer. None of it affects
 * scheduling, so it lives beside useLearnSession rather than inside it; the session
 * calls `resetForCard` when it serves a card and `resetForSession` when it reloads.
 */
export function useLearnView(
  startInFocusMode: boolean,
  notify: ReturnType<typeof useToast>['notify'],
) {
  const startInFocusModeRef = useRef(startInFocusMode);
  useEffect(() => {
    startInFocusModeRef.current = startInFocusMode;
  }, [startInFocusMode]);

  const [menuOpen, setMenuOpen] = useState(false);
  // Focus mode hides the surrounding chrome for distraction-free review.
  const [focusMode, setFocusMode] = useState(startInFocusMode);
  const [focusChromeVisible, setFocusChromeVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The keyboard-shortcuts cheatsheet (opened with the configured help key).
  const [hintsOpen, setHintsOpen] = useState(false);
  // Navigation drawer — closed by default to keep Learn mode distraction-free,
  // opened on demand for quick navigation away without leaving the session UI.
  const [navOpen, setNavOpen] = useState(false);
  // Typed answer for typing cards.
  const [typedAnswer, setTypedAnswer] = useState('');
  const typingInputRef = useRef<HTMLInputElement>(null);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify('Full screen is not available.', 'negative');
    }
  }, [notify]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const resetForCard = useCallback(() => {
    setMenuOpen(false);
    setTypedAnswer('');
  }, []);

  const resetForSession = useCallback(() => {
    setMenuOpen(false);
    setHintsOpen(false);
    setNavOpen(false);
    setFocusMode(startInFocusModeRef.current);
    setFocusChromeVisible(false);
  }, []);

  /** Wrap a card-menu action so the menu closes when it runs. */
  const closingMenu = useCallback(
    <Args extends unknown[], Result>(action: (...args: Args) => Result) =>
      (...args: Args) => {
        setMenuOpen(false);
        return action(...args);
      },
    [],
  );

  return {
    menuOpen,
    setMenuOpen,
    focusMode,
    setFocusMode,
    focusChromeVisible,
    setFocusChromeVisible,
    isFullscreen,
    toggleFullscreen,
    hintsOpen,
    setHintsOpen,
    navOpen,
    setNavOpen,
    typedAnswer,
    setTypedAnswer,
    typingInputRef,
    resetForCard,
    resetForSession,
    closingMenu,
  };
}
