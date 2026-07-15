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
  inputId: number;
  inputType: 'pointer' | 'touch';
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
  const touchCleanupRef = useRef(new Map<string, () => void>());
  const sessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef<{ lessonId: string; until: number } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const clearSession = useCallback((releaseCapture: boolean) => {
    const session = sessionRef.current;
    if (!session) return;
    window.clearTimeout(session.timer);
    if (
      releaseCapture &&
      session.inputType === 'pointer' &&
      session.element.hasPointerCapture?.(session.inputId)
    ) {
      session.element.releasePointerCapture(session.inputId);
    }
    sessionRef.current = null;
    setDragState(null);
  }, []);

  useEffect(
    () => () => {
      clearSession(true);
      for (const cleanup of touchCleanupRef.current.values()) cleanup();
      touchCleanupRef.current.clear();
    },
    [clearSession],
  );

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
          touchCleanupRef.current.get(lessonId)?.();
          touchCleanupRef.current.delete(lessonId);
          if (!element) {
            elementsRef.current.delete(lessonId);
            return;
          }
          elementsRef.current.set(lessonId, element);

          const touchFor = (touches: TouchList, inputId: number): Touch | undefined => {
            for (let index = 0; index < touches.length; index++) {
              const touch = touches[index];
              if (touch?.identifier === inputId) return touch;
            }
            return undefined;
          };
          const startTouch = (event: TouchEvent) => {
            if (!interactionEnabled || event.touches.length !== 1 || sessionRef.current) return;
            const touch = event.touches[0];
            if (!touch) return;
            // A new physical gesture cannot be the synthetic click belonging to
            // the preceding drop, so it must never inherit that suppression.
            suppressClickRef.current = null;
            const inputId = touch.identifier;
            const timer = window.setTimeout(() => {
              const session = sessionRef.current;
              if (
                !session ||
                session.inputType !== 'touch' ||
                session.inputId !== inputId
              )
                return;
              session.active = true;
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
              inputId,
              inputType: 'touch',
              startX: touch.clientX,
              startY: touch.clientY,
              element,
              timer,
              active: false,
              targetIndex: 0,
            };
          };
          const moveTouch = (event: TouchEvent) => {
            const session = sessionRef.current;
            if (!session || session.inputType !== 'touch' || session.lessonId !== lessonId) return;
            const touch = touchFor(event.touches, session.inputId);
            if (!touch) return;
            if (!session.active) {
              const distance = Math.hypot(
                touch.clientX - session.startX,
                touch.clientY - session.startY,
              );
              if (distance > EARLY_MOVE_LIMIT_PX) clearSession(false);
              // Deliberately do not preventDefault: movement before the hold is
              // an ordinary vertical scroll, not a failed drag.
              return;
            }
            event.preventDefault();
            session.targetIndex = targetIndexForY(lessonId, touch.clientY);
            setDragState({ lessonId, targetIndex: session.targetIndex });
          };
          const endTouch = (event: TouchEvent) => {
            const session = sessionRef.current;
            if (!session || session.inputType !== 'touch' || session.lessonId !== lessonId) return;
            if (!touchFor(event.changedTouches, session.inputId)) return;
            const targetIndex = session.targetIndex;
            const active = session.active;
            if (active) event.preventDefault();
            clearSession(false);
            if (!active) return;
            // Suppress only the compatibility click generated by this completed
            // drag. The timeout is measured from drop, so a long drag cannot
            // outlive it; any new pointer/touch start clears it immediately.
            suppressClickRef.current = { lessonId, until: Date.now() + 750 };
            void persistOrder(lessonId, targetIndex);
          };
          const cancelTouch = (event: TouchEvent) => {
            const session = sessionRef.current;
            if (!session || session.inputType !== 'touch' || session.lessonId !== lessonId) return;
            if (!touchFor(event.changedTouches, session.inputId)) return;
            const wasActive = session.active;
            clearSession(false);
            suppressClickRef.current = null;
            if (wasActive) {
              setAnnouncement(`${lessonNames.get(lessonId) ?? 'Lesson'} move cancelled.`);
            }
          };
          element.addEventListener('touchstart', startTouch, { passive: true });
          element.addEventListener('touchmove', moveTouch, { passive: false });
          element.addEventListener('touchend', endTouch, { passive: false });
          element.addEventListener('touchcancel', cancelTouch, { passive: true });
          const cleanup = () => {
            element.removeEventListener('touchstart', startTouch);
            element.removeEventListener('touchmove', moveTouch);
            element.removeEventListener('touchend', endTouch);
            element.removeEventListener('touchcancel', cancelTouch);
          };
          touchCleanupRef.current.set(lessonId, cleanup);
        },
        onPointerDown: (event) => {
          if (
            !interactionEnabled ||
            event.pointerType === 'touch' ||
            event.button !== 0 ||
            sessionRef.current
          )
            return;
          const element = event.currentTarget;
          suppressClickRef.current = null;
          const inputId = event.pointerId;
          const startX = event.clientX;
          const startY = event.clientY;
          const timer = window.setTimeout(() => {
            const session = sessionRef.current;
            if (
              !session ||
              session.inputType !== 'pointer' ||
              session.inputId !== inputId
            )
              return;
            session.active = true;
            element.setPointerCapture?.(inputId);
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
            inputId,
            inputType: 'pointer',
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
          if (
            !session ||
            session.inputType !== 'pointer' ||
            session.inputId !== event.pointerId ||
            session.lessonId !== lessonId
          )
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
          if (
            !session ||
            session.inputType !== 'pointer' ||
            session.inputId !== event.pointerId ||
            session.lessonId !== lessonId
          )
            return;
          const targetIndex = session.targetIndex;
          const active = session.active;
          clearSession(true);
          if (active) {
            suppressClickRef.current = { lessonId, until: Date.now() + 750 };
            void persistOrder(lessonId, targetIndex);
          }
        },
        onPointerCancel: (event) => {
          const session = sessionRef.current;
          if (
            !session ||
            session.inputType !== 'pointer' ||
            session.inputId !== event.pointerId ||
            session.lessonId !== lessonId
          )
            return;
          const wasActive = session.active;
          clearSession(true);
          suppressClickRef.current = null;
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
