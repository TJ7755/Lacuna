// Opening the study sheet from anywhere inside the shell. It is app-level state rather
// than page state because two very different places raise it — a course's Study button
// and Review today in the sidebar — and because dismissing it must leave the user
// exactly where they were, which a route could not do.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface StudySheetValue {
  /** Pass a course to open at its options, or nothing to ask which course first. */
  openStudySheet: (courseId?: string | null) => void;
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
  close: () => void;
  value: StudySheetValue;
} {
  const [state, setState] = useState<{ open: boolean; courseId: string | null }>({
    open: false,
    courseId: null,
  });

  const openStudySheet = useCallback((courseId?: string | null) => {
    setState({ open: true, courseId: courseId ?? null });
  }, []);

  const close = useCallback(() => setState({ open: false, courseId: null }), []);
  const value = useMemo(() => ({ openStudySheet }), [openStudySheet]);

  return { open: state.open, courseId: state.courseId, close, value };
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
