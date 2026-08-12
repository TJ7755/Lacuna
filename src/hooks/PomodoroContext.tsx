import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePomodoro } from './usePomodoro';

export type PomodoroController = ReturnType<typeof usePomodoro>;

const PomodoroContext = createContext<PomodoroController | null>(null);

interface PomodoroFlowController {
  breakPending: boolean;
  acceptBreak: PomodoroController['acceptBreak'];
  deferBreak: PomodoroController['deferBreak'];
}

const PomodoroFlowContext = createContext<PomodoroFlowController | null>(null);

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const controller = usePomodoro();
  const flowController = useMemo(
    () => ({
      breakPending: controller.breakPending,
      acceptBreak: controller.acceptBreak,
      deferBreak: controller.deferBreak,
    }),
    [controller.acceptBreak, controller.breakPending, controller.deferBreak],
  );
  return (
    <PomodoroContext.Provider value={controller}>
      <PomodoroFlowContext.Provider value={flowController}>
        {children}
      </PomodoroFlowContext.Provider>
    </PomodoroContext.Provider>
  );
}

export function usePomodoroContext(): PomodoroController {
  const controller = useContext(PomodoroContext);
  if (!controller) throw new Error('usePomodoroContext must be used within PomodoroProvider.');
  return controller;
}

export function useOptionalPomodoroContext(): PomodoroController | null {
  return useContext(PomodoroContext);
}

/** Flow-level timer state excludes the per-second countdown used by the timer chrome. */
export function usePomodoroFlowContext(): PomodoroFlowController {
  const controller = useContext(PomodoroFlowContext);
  if (!controller) throw new Error('usePomodoroFlowContext must be used within PomodoroProvider.');
  return controller;
}
