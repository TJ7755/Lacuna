import { useCallback, useMemo, useRef } from 'react';
import { recordUsageAction } from '../../usage/actions';
import type { SessionSummary } from '../../course/sessionSummary';
import { transitionCompletion, type CompletionState } from './sessionMachine';

interface CompletionEnvironment {
  /** Read current guards after awaits, rather than capturing the last answer. */
  read(): { mounted: boolean; submitting: boolean; retainUndo: boolean };
  persist(summary: SessionSummary): Promise<SessionSummary>;
  present(summary: SessionSummary, confirmed: boolean): void;
  clearUndo(): void;
  reportError(cause: unknown, retry: () => void): void;
  setProgress(value: number): void;
}

export interface SessionCompletion {
  readonly pending: boolean;
  readonly persisting: boolean;
  propose(summary: SessionSummary): void;
  confirm(): Promise<boolean>;
  settle(): Promise<boolean>;
  reset(): void;
  beginPass(): void;
}

/** Owns provisional reports, single-flight confirmation and their Undo lifecycle. */
export function useSessionCompletion({
  read,
  persist,
  present,
  clearUndo,
  reportError,
  setProgress,
}: CompletionEnvironment): SessionCompletion {
  const state = useRef<CompletionState>({ finalising: false, confirmed: false, pending: null });
  const pendingWrite = useRef<Promise<boolean> | null>(null);

  // False preserves a provisional report and Undo after a failed write. Navigation
  // and continuation must await true before leaving it behind.
  const confirm = useCallback((): Promise<boolean> => {
    if (pendingWrite.current) return pendingWrite.current;
    const guard = read();
    if (guard.submitting && guard.retainUndo) return Promise.resolve(false);
    const summary = state.current.pending;
    if (!summary) return Promise.resolve(state.current.confirmed);
    const commit = async (): Promise<boolean> => {
      try {
        const deliveredSummary = await persist(summary);
        recordUsageAction('study-completed');
        state.current = transitionCompletion(state.current, { type: 'confirmed' }).state;
        clearUndo();
        if (read().mounted) present(deliveredSummary, true);
        return true;
      } catch (cause) {
        state.current = transitionCompletion(state.current, {
          type: 'failed',
          retainUndo: read().retainUndo,
        }).state;
        reportError(cause, () => {
          if (read().mounted && state.current.pending === summary) void confirm();
        });
        return false;
      } finally {
        pendingWrite.current = null;
      }
    };
    pendingWrite.current = commit();
    return pendingWrite.current;
  }, [read, persist, clearUndo, present, reportError]);

  const settle = useCallback(
    () => (state.current.pending || pendingWrite.current ? confirm() : Promise.resolve(true)),
    [confirm],
  );

  const propose = useCallback(
    (summary: SessionSummary) => {
      const guard = read();
      if (!guard.mounted) return;
      const transition = transitionCompletion(state.current, {
        type: 'propose',
        summary,
        retainUndo: guard.retainUndo,
      });
      state.current = transition.state;
      if (summary.reachedGoal && transition.effects.length > 0) setProgress(1);
      for (const effect of transition.effects) {
        if (effect === 'show-summary') present(summary, false);
        else if (effect === 'clear-undo') clearUndo();
        else if (effect === 'persist-completion') void confirm();
      }
    },
    [read, setProgress, present, clearUndo, confirm],
  );

  const reset = useCallback(() => {
    // An in-flight write remains owned until it settles, including on reload.
    state.current = transitionCompletion(state.current, { type: 'reset' }).state;
  }, []);

  const beginPass = useCallback(() => {
    if (state.current.confirmed) reset();
  }, [reset]);

  return useMemo(
    () => ({
      get pending() {
        return state.current.pending !== null;
      },
      get persisting() {
        return pendingWrite.current !== null;
      },
      propose,
      confirm,
      settle,
      reset,
      beginPass,
    }),
    [propose, confirm, settle, reset, beginPass],
  );
}
