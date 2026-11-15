import { useMemo, useRef } from 'react';
import { createSessionCompletion } from './sessionCompletion';
export type { SessionCompletion } from './sessionCompletion';

export function useSessionCompletion(environment: Parameters<typeof createSessionCompletion>[0]) {
  const latest = useRef(environment);
  latest.current = environment;
  return useMemo(
    () =>
      createSessionCompletion({
        read: () => latest.current.read(),
        persist: (summary) => latest.current.persist(summary),
        present: (summary, confirmed) => latest.current.present(summary, confirmed),
        clearUndo: () => latest.current.clearUndo(),
        reportError: (cause, retry) => latest.current.reportError(cause, retry),
        setProgress: (value) => latest.current.setProgress(value),
      }),
    [],
  );
}
