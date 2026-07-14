import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { Lesson } from '../../db/types';
import { reorderLessons } from '../../db/repository';
import { hapticStrong } from '../../utils/haptic';

const HOLD_DELAY_MS = 350;
const EARLY_MOVE_LIMIT_PX = 8;

export type LessonDropMarker = 'before' | 'after' | undefined;

export interface LessonReorderInteraction {
  enabled: boolean;
  lifted: boolean;
  dropMarker: LessonDropMarker;
  registerElement: (element: HTMLButtonElement | null) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClickCapture: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

interface DragSession {
  lessonId: string;
  pointerId: number;
  startX: number;
  startY: number;
  element: HTMLButtonElement;
  timer: number;
  active: boolean;
  targetIndex: number;
}

interface DragState {
  lessonId: string;
  targetIndex: number;
}

/** Moves one lesson into an insertion index measured against the remaining lessons. */
export function moveLessonIds(
  orderedLessonIds: string[],
  lessonId: string,
  targetIndex: number,
): string[] {
  if (!orderedLessonIds.includes(lessonId)) return orderedLessonIds;
  const remaining = orderedLessonIds.filter((id) => id !== lessonId);
  const clampedIndex = Math.max(0, Math.min(targetIndex, remaining.length));
  return [
    ...remaining.slice(0, clampedIndex),
    lessonId,
    ...remaining.slice(clampedIndex),
  ];
}

function sameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function useLessonPathReorder({
  courseId,
  lessons,
  enabled,
  onError,
}: {
  courseId: string;
  lessons: Lesson[];
  enabled: boolean;
  onError: (message: string) => void;
}) {
  const orderedLessons = useMemo(
    () => [...lessons].sort((a, b) => a.orderIndex - b.orderIndex),
    [lessons],
  );
  const orderedIds = useMemo(() => orderedLessons.map((lesson) => lesson.id), [orderedLessons]);
  const lessonNames = useMemo(
    () => new Map(orderedLessons.map((lesson) => [lesson.id, lesson.name])),
    [orderedLessons],
  );
  const elementsRef = useRef(new Map<string, HTMLButtonElement>());
  const sessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef<{ lessonId: string; until: number } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const clearSession = useCallback((releaseCapture: boolean) => {
    const session = sessionRef.current;
    if (!session) return;
    window.clearTimeout(session.timer);
    if (releaseCapture && session.element.hasPointerCapture?.(session.pointerId)) {
      session.element.releasePointerCapture(session.pointerId);
    }
    sessionRef.current = null;
    setDragState(null);
  }, []);

  useEffect(() => () => clearSession(true), [clearSession]);

  useEffect(() => {
    if (enabled) return;
    clearSession(true);
  }, [clearSession, enabled]);

  const targetIndexForY = useCallback(
    (lessonId: string, clientY: number) => {
      const remainingIds = orderedIds.filter((id) => id !== lessonId);
      let targetIndex = 0;
      for (const id of remainingIds) {
        const element = elementsRef.current.get(id);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (clientY >= rect.top + rect.height / 2) targetIndex += 1;
      }
      return targetIndex;
    },
    [orderedIds],
  );

  const persistOrder = useCallback(
    async (lessonId: string, targetIndex: number) => {
      const nextIds = moveLessonIds(orderedIds, lessonId, targetIndex);
      if (sameOrder(nextIds, orderedIds)) {
        setAnnouncement(`${lessonNames.get(lessonId) ?? 'Lesson'} order unchanged.`);
        return;
      }
      setPending(true);
      try {
        await reorderLessons(courseId, nextIds);
        const finalIndex = nextIds.indexOf(lessonId);
        setAnnouncement(
          `${lessonNames.get(lessonId) ?? 'Lesson'} moved to position ${finalIndex + 1} of ${nextIds.length}.`,
        );
      } catch {
        const message = 'Lesson order could not be saved.';
        setAnnouncement(message);
        onError(message);
      } finally {
        setPending(false);
      }
    },
    [courseId, lessonNames, onError, orderedIds],
  );

  useEffect(() => {
    if (!dragState) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const lessonName = lessonNames.get(dragState.lessonId) ?? 'Lesson';
      clearSession(true);
      setAnnouncement(`${lessonName} move cancelled.`);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSession, dragState, lessonNames]);

  const dropMarkerByLessonId = useMemo(() => {
    const result = new Map<string, LessonDropMarker>();
    if (!dragState) return result;
    const remainingIds = orderedIds.filter((id) => id !== dragState.lessonId);
    if (remainingIds.length === 0) return result;
    if (dragState.targetIndex >= remainingIds.length) {
      result.set(remainingIds[remainingIds.length - 1], 'after');
    } else {
      result.set(remainingIds[dragState.targetIndex], 'before');
    }
    return result;
  }, [dragState, orderedIds]);

  const interactionFor = useCallback(
    (lessonId: string): LessonReorderInteraction => {
      const interactionEnabled = enabled && !pending;
      return {
        enabled: interactionEnabled,
        lifted: dragState?.lessonId === lessonId,
        dropMarker: dropMarkerByLessonId.get(lessonId),
        registerElement: (element) => {
          if (element) elementsRef.current.set(lessonId, element);
          else elementsRef.current.delete(lessonId);
        },
        onPointerDown: (event) => {
          if (!interactionEnabled || event.button !== 0 || sessionRef.current) return;
          const element = event.currentTarget;
          const pointerId = event.pointerId;
          const startX = event.clientX;
          const startY = event.clientY;
          const timer = window.setTimeout(() => {
            const session = sessionRef.current;
            if (!session || session.pointerId !== pointerId) return;
            session.active = true;
            suppressClickRef.current = { lessonId, until: Date.now() + 750 };
            element.setPointerCapture?.(pointerId);
            const originalIndex = orderedIds.indexOf(lessonId);
            session.targetIndex = Math.max(originalIndex, 0);
            setDragState({ lessonId, targetIndex: session.targetIndex });
            setAnnouncement(
              `${lessonNames.get(lessonId) ?? 'Lesson'} lifted. Drag to a new position, then release.`,
            );
            hapticStrong();
          }, HOLD_DELAY_MS);
          sessionRef.current = {
            lessonId,
            pointerId,
            startX,
            startY,
            element,
            timer,
            active: false,
            targetIndex: 0,
          };
        },
        onPointerMove: (event) => {
          const session = sessionRef.current;
          if (!session || session.pointerId !== event.pointerId || session.lessonId !== lessonId)
            return;
          if (!session.active) {
            const distance = Math.hypot(
              event.clientX - session.startX,
              event.clientY - session.startY,
            );
            if (distance > EARLY_MOVE_LIMIT_PX) clearSession(false);
            return;
          }
          event.preventDefault();
          session.targetIndex = targetIndexForY(lessonId, event.clientY);
          setDragState({ lessonId, targetIndex: session.targetIndex });
        },
        onPointerUp: (event) => {
          const session = sessionRef.current;
          if (!session || session.pointerId !== event.pointerId || session.lessonId !== lessonId)
            return;
          const targetIndex = session.targetIndex;
          const active = session.active;
          clearSession(true);
          if (active) void persistOrder(lessonId, targetIndex);
        },
        onPointerCancel: (event) => {
          const session = sessionRef.current;
          if (!session || session.pointerId !== event.pointerId || session.lessonId !== lessonId)
            return;
          const wasActive = session.active;
          clearSession(true);
          if (wasActive) {
            setAnnouncement(`${lessonNames.get(lessonId) ?? 'Lesson'} move cancelled.`);
          }
        },
        onClickCapture: (event) => {
          const suppression = suppressClickRef.current;
          if (!suppression || suppression.lessonId !== lessonId || Date.now() > suppression.until)
            return;
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = null;
        },
        onKeyDown: (event) => {
          if (!interactionEnabled || !event.altKey) return;
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          event.stopPropagation();
          const currentIndex = orderedIds.indexOf(lessonId);
          if (currentIndex < 0) return;
          const targetIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
          if (targetIndex < 0 || targetIndex >= orderedIds.length) {
            setAnnouncement(`${lessonNames.get(lessonId) ?? 'Lesson'} cannot move further.`);
            return;
          }
          void persistOrder(lessonId, targetIndex);
        },
      };
    },
    [
      clearSession,
      dragState,
      dropMarkerByLessonId,
      enabled,
      lessonNames,
      orderedIds,
      pending,
      persistOrder,
      targetIndexForY,
    ],
  );

  return { announcement, interactionFor, pending };
}
