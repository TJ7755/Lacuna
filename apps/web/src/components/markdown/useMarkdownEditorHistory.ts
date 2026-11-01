import { useEffect, useRef, type RefObject } from 'react';
import type { Replacement } from './markdownSelection';

export function useMarkdownEditorHistory(
  value: string,
  onChange: (value: string) => void,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
) {
  /* Undo/redo history */
  interface HistoryEntry {
    text: string;
    selStart: number;
    selEnd: number;
  }
  // Captured once on first render (lazy ref init) so the mount-only effect below can seed
  // history without depending on the `value` prop, which changes on every keystroke.
  const initialValueRef = useRef(value);
  const historyRef = useRef<HistoryEntry[]>([
    { text: initialValueRef.current, selStart: 0, selEnd: 0 },
  ]);
  const historyIndexRef = useRef(0);
  const historyTimerRef = useRef<number | null>(null);
  const lastPushedTextRef = useRef(initialValueRef.current);
  const currentValueRef = useRef(initialValueRef.current);

  useEffect(() => {
    currentValueRef.current = value;
  }, [value]);

  useEffect(() => {
    // Reset history when the editor is mounted for a new card. Uses the value captured at
    // first render (initialValueRef), not the live `value` prop, so this genuinely only
    // needs to run on mount — no eslint suppression required. Subsequent changes are
    // handled by pushHistory/scheduleHistoryPush.
    const initial = initialValueRef.current;
    historyRef.current = [{ text: initial, selStart: 0, selEnd: 0 }];
    historyIndexRef.current = 0;
    lastPushedTextRef.current = initial;
    currentValueRef.current = initial;
    return () => {
      cancelHistoryTimer();
    };
  }, []);

  function pushHistory() {
    const el = textareaRef.current;
    const entry: HistoryEntry = {
      text: currentValueRef.current,
      selStart: el?.selectionStart ?? 0,
      selEnd: el?.selectionEnd ?? 0,
    };
    // Avoid duplicate adjacent entries.
    if (lastPushedTextRef.current === entry.text) return;

    // Truncate any redo entries.
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }

    historyRef.current.push(entry);
    historyIndexRef.current = historyRef.current.length - 1;
    lastPushedTextRef.current = entry.text;

    // Cap at 50 entries.
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
  }

  function scheduleHistoryPush() {
    if (historyTimerRef.current) window.clearTimeout(historyTimerRef.current);
    historyTimerRef.current = window.setTimeout(() => pushHistory(), 800);
  }

  function cancelHistoryTimer() {
    if (historyTimerRef.current) {
      window.clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
  }

  function undo() {
    cancelHistoryTimer();
    pushHistory();
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    lastPushedTextRef.current = entry.text;
    currentValueRef.current = entry.text;
    onChange(entry.text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(entry.selStart, entry.selEnd);
    });
  }

  function redo() {
    cancelHistoryTimer();
    // A fresh edit replaces the redo branch even before the debounce has elapsed.
    pushHistory();
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const entry = historyRef.current[historyIndexRef.current];
    lastPushedTextRef.current = entry.text;
    currentValueRef.current = entry.text;
    onChange(entry.text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(entry.selStart, entry.selEnd);
    });
  }

  function applyReplacement(rep: Replacement) {
    cancelHistoryTimer();
    pushHistory();
    currentValueRef.current = rep.text;
    onChange(rep.text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(rep.selStart, rep.selEnd);
      pushHistory();
    });
  }

  return {
    currentValueRef,
    pushHistory,
    scheduleHistoryPush,
    cancelHistoryTimer,
    undo,
    redo,
    applyReplacement,
  };
}
