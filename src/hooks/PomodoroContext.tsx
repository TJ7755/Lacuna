import { createContext, useContext, type ReactNode } from 'react';
import { usePomodoro } from './usePomodoro';

export type PomodoroController = ReturnType<typeof usePomodoro>;

const PomodoroContext = createContext<PomodoroController | null>(null);

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const controller = usePomodoro();
  return <PomodoroContext.Provider value={controller}>{children}</PomodoroContext.Provider>;
}

export function usePomodoroContext(): PomodoroController {
  const controller = useContext(PomodoroContext);
  if (!controller) throw new Error('usePomodoroContext must be used within PomodoroProvider.');
  return controller;
}

export function useOptionalPomodoroContext(): PomodoroController | null {
  return useContext(PomodoroContext);
}
