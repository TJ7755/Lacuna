// Opening the study sheet from anywhere inside the shell. It is app-level state rather
// than page state because two very different places raise it — a course's Study button
// and Review today in the sidebar — and because dismissing it must leave the user
// exactly where they were, which a route could not do.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface StudySheetOptions {
  /** False when the opener already offers Other ways beside its Study button. */
  otherWays?: boolean;
}

interface StudySheetValue {
  /** Pass a course to open at its options, or nothing to ask which course first. */
  openStudySheet: (courseId?: string | null, options?: StudySheetOptions) => void;
}

const StudySheetContext = createContext<StudySheetValue | null>(null);

export function useStudySheet(): StudySheetValue {
  const value = useContext(StudySheetContext);
  if (!value) throw new Error('useStudySheet must be used within the app shell');
  return value;
}

export function useStudySheetState(): {
  open: boolean;
  courseId: string | null;
  otherWays: boolean;
  close: () => void;
  value: StudySheetValue;
} {
  const [state, setState] = useState<{
    open: boolean;
    courseId: string | null;
    otherWays: boolean;
  }>({
    open: false,
    courseId: null,
    otherWays: true,
  });

  const openStudySheet = useCallback((courseId?: string | null, options?: StudySheetOptions) => {
    setState({ open: true, courseId: courseId ?? null, otherWays: options?.otherWays ?? true });
  }, []);

  // Keeps otherWays as it was, so the closing sheet does not change while it leaves.
  const close = useCallback(
    () => setState((prev) => ({ ...prev, open: false, courseId: null })),
    [],
  );
  const value = useMemo(() => ({ openStudySheet }), [openStudySheet]);

  return { open: state.open, courseId: state.courseId, otherWays: state.otherWays, close, value };
}

export function StudySheetProvider({
  value,
  children,
}: {
  value: StudySheetValue;
  children: ReactNode;
}) {
  return <StudySheetContext.Provider value={value}>{children}</StudySheetContext.Provider>;
}
