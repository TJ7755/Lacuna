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
export function createSessionCompletion({
  read,
  persist,
  present,
  clearUndo,
  reportError,
  setProgress,
}: CompletionEnvironment): SessionCompletion {
  let state: CompletionState = { finalising: false, confirmed: false, pending: null };
  let pendingWrite: Promise<boolean> | null = null;

  // False preserves a provisional report and Undo after a failed write. Navigation
  // and continuation must await true before leaving it behind.
  const confirm = (): Promise<boolean> => {
    if (pendingWrite) return pendingWrite;
    const guard = read();
    if (guard.submitting && guard.retainUndo) return Promise.resolve(false);
    const summary = state.pending;
    if (!summary) return Promise.resolve(state.confirmed);
    const commit = async (): Promise<boolean> => {
      try {
        const deliveredSummary = await persist(summary);
        if (!read().mounted || state.pending !== summary) return false;
        recordUsageAction('study-completed');
        state = transitionCompletion(state, { type: 'confirmed' }).state;
        clearUndo();
        if (read().mounted) present(deliveredSummary, true);
        return true;
      } catch (cause) {
        if (!read().mounted || state.pending !== summary) return false;
        state = transitionCompletion(state, {
          type: 'failed',
          retainUndo: read().retainUndo,
        }).state;
        reportError(cause, () => {
          if (read().mounted && state.pending === summary) void confirm();
        });
        return false;
      } finally {
        pendingWrite = null;
      }
    };
    pendingWrite = commit();
    return pendingWrite;
  };

  const settle = () => (state.pending || pendingWrite ? confirm() : Promise.resolve(true));

  const propose = (summary: SessionSummary) => {
    const guard = read();
    if (!guard.mounted) return;
    const transition = transitionCompletion(state, {
      type: 'propose',
      summary,
      retainUndo: guard.retainUndo,
    });
    state = transition.state;
    if (summary.reachedGoal && transition.effects.length > 0) setProgress(1);
    for (const effect of transition.effects) {
      if (effect === 'show-summary') present(summary, false);
      else if (effect === 'clear-undo') clearUndo();
      else if (effect === 'persist-completion') void confirm();
    }
  };

  const reset = () => {
    // An in-flight write remains owned until it settles, including on reload.
    state = transitionCompletion(state, { type: 'reset' }).state;
  };

  const beginPass = () => {
    if (state.confirmed) reset();
  };

  return {
    get pending() {
      return state.pending !== null;
    },
    get persisting() {
      return pendingWrite !== null;
    },
    propose,
    confirm,
    settle,
    reset,
    beginPass,
  };
}
