// Study buttons and their keyboard shortcuts share one anchored session preview.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface StudySheetOptions {
  /** False when the opener already offers Other ways beside its Study button. */
  otherWays?: boolean;
  anchor?: HTMLElement;
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
  anchor: HTMLElement | null;
  close: () => void;
  value: StudySheetValue;
} {
  const [state, setState] = useState<{
    open: boolean;
    courseId: string | null;
    otherWays: boolean;
    anchor: HTMLElement | null;
  }>({
    open: false,
    courseId: null,
    otherWays: true,
    anchor: null,
  });

  const openStudySheet = useCallback((courseId?: string | null, options?: StudySheetOptions) => {
    const anchor =
      options?.anchor ??
      Array.from(document.querySelectorAll<HTMLElement>('[data-study-trigger]')).find(
        (element) =>
          (!courseId || element.dataset.studyTrigger === courseId) &&
          !element.matches(':disabled') &&
          !element.closest('[inert]'),
      );
    if (!anchor) return;
    setState({
      open: true,
      courseId: courseId ?? null,
      otherWays: options?.otherWays ?? true,
      anchor,
    });
  }, []);

  // Keeps otherWays as it was, so the closing preview does not change while it leaves.
  const close = useCallback(() => setState((prev) => ({ ...prev, open: false })), []);
  const value = useMemo(() => ({ openStudySheet }), [openStudySheet]);

  return {
    open: state.open,
    courseId: state.courseId,
    anchor: state.anchor,
    otherWays: state.otherWays,
    close,
    value,
  };
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
