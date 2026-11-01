import { capturePathSlots } from './pathReorderLayout';
import { lessonPathReorderPreview, sameOrder } from './lessonPathReorderPreview';
import {
  bindPathTouchReorder,
  type DragSession,
  type DragState,
  type TouchReorderContext,
} from './bindPathTouchReorder';
import { usePathDropTransition } from './usePathDropTransition';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Lesson } from '../../db/types';
import { reorderLessons } from '../../db/lessonRepository';
import { hapticStrong } from '../../utils/haptic';

const EARLY_MOVE_LIMIT_PX = 8;

export type LessonDropMarker = 'before' | 'after' | undefined;

export interface LessonReorderInteraction {
  enabled: boolean;
  lifted: boolean;
  offset?: { x: number; y: number };
  dropMarker: LessonDropMarker;
  dropMarkerActive?: boolean;
  refused?: boolean;
  direct?: boolean;
  settleVelocity?: number;
  registerElement: (element: HTMLButtonElement | null) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClickCapture: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
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
  return [...remaining.slice(0, clampedIndex), lessonId, ...remaining.slice(clampedIndex)];
}

export function usePathReorder({
  items,
  onReorder,
  orderForMove = moveLessonIds,
  keyboardTarget,
  holdDelay = 0,
  enabled,
  onError,
}: {
  items: { id: string; name: string; draggable?: boolean; dragId?: string }[];
  onReorder: (ids: string[], id: string) => Promise<void>;
  orderForMove?: (ids: string[], id: string, index: number) => string[] | null;
  keyboardTarget?: (id: string, delta: -1 | 1) => number;
  holdDelay?: number;
  enabled: boolean;
  onError: (message: string) => void;
}) {
  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const lessonNames = useMemo(() => new Map(items.map((item) => [item.id, item.name])), [items]);
  const elementsRef = useRef(new Map<string, HTMLButtonElement>());
  const touchCleanupRef = useRef(new Map<string, () => void>());
  const sessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef<{ lessonId: string; until: number } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const draggingId = dragState?.lessonId;
  const dragBounds = useMemo(() => {
    if (!draggingId) return undefined;
    const slots = items.flatMap((item) => {
      if ((item.dragId ?? item.id) !== draggingId) return [];
      const slot = sessionRef.current?.slots.get(item.id);
      return slot ? [slot] : [];
    });
    return slots.length
      ? {
          top: Math.min(...slots.map((slot) => slot.top)),
          bottom: Math.max(...slots.map((slot) => slot.bottom)),
        }
      : undefined;
  }, [draggingId, items]);

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

  const dropTransition = usePathDropTransition(orderedIds.join('\0'), elementsRef, () =>
    clearSession(true),
  );

  // Native listeners belong to the element ref. Effect cleanup can run during
  // Fast Refresh while Motion keeps that ref mounted.
  useEffect(() => () => clearSession(true), [clearSession]);

  useEffect(() => {
    if (enabled) return;
    clearSession(true);
  }, [clearSession, enabled]);

  const targetIndexForY = useCallback(
    (lessonId: string, clientY: number) => {
      clientY -= sessionRef.current?.targetOffsetY ?? 0;
      const remainingIds = orderedIds.filter((id) => id !== lessonId);
      let targetIndex = 0;
      for (const id of remainingIds) {
        const rect =
          sessionRef.current?.slots.get(id) ?? elementsRef.current.get(id)?.getBoundingClientRect();
        if (!rect) continue;
        if (
          clientY >=
          rect.top -
            ((sessionRef.current?.scroller?.scrollTop ?? 0) -
              (sessionRef.current?.scrollTop ?? 0)) +
            rect.height / 2
        )
          targetIndex += 1;
      }
      return targetIndex;
    },
    [orderedIds],
  );

  const scrollFrame = useRef<() => void>(() => {});
  scrollFrame.current = () => {
    const session = sessionRef.current;
    if (!session?.active || !session.scroller || session.clientY === undefined) return;
    const edge = 64;
    const bounds = session.scroller.getBoundingClientRect();
    const top = Math.max(0, bounds.top);
    const bottom = Math.min(window.innerHeight, bounds.bottom || window.innerHeight);
    // Scroll compensation keeps the held rows at this viewport displacement.
    const displacement = session.clientY - session.startY;
    const topDistance =
      Math.min(session.clientY, (dragBounds?.top ?? session.startY) + displacement) - top;
    const bottomDistance =
      bottom - Math.max(session.clientY, (dragBounds?.bottom ?? session.startY) + displacement);
    const down =
      bottomDistance <= edge && (topDistance > edge || session.clientY >= (top + bottom) / 2);
    const direction = down ? 1 : topDistance <= edge ? -1 : 0;
    const distance = down ? bottomDistance : topDistance;
    const step = direction * Math.min(14, Math.max(1, (edge - distance) / 4));
    if (!step) return;
    const before = session.scroller.scrollTop;
    // Transformed rows can extend scrollHeight beyond the course's real end.
    session.scroller.scrollTop = Math.max(
      0,
      Math.min(
        session.scrollMax ?? session.scroller.scrollHeight - session.scroller.clientHeight,
        before + step,
      ),
    );
    if (session.scroller.scrollTop === before) return;
    session.targetIndex = targetIndexForY(session.lessonId, session.clientY);
    setDragState({
      lessonId: session.lessonId,
      targetIndex: session.targetIndex,
      x: 0,
      y: session.clientY - session.startY + session.scroller.scrollTop - (session.scrollTop ?? 0),
    });
  };
  useEffect(() => {
    if (!draggingId) return;
    let frame: number;
    const tick = () => {
      scrollFrame.current();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draggingId]);

  const persistOrder = useCallback(
    async (lessonId: string, targetIndex: number) => {
      const nextIds = orderForMove(orderedIds, lessonId, targetIndex);
      if (!nextIds) {
        dropTransition.reset();
        clearSession(true);
        setAnnouncement(`${lessonNames.get(lessonId) ?? 'Row'} cannot move there.`);
        return;
      }
      if (sameOrder(nextIds, orderedIds)) {
        dropTransition.reset();
        clearSession(true);
        setAnnouncement(`${lessonNames.get(lessonId) ?? 'Lesson'} order unchanged.`);
        return;
      }
      setPending(true);
      try {
        await onReorder(nextIds, lessonId);
        const finalIndex = nextIds.indexOf(lessonId);
        setAnnouncement(
          `${lessonNames.get(lessonId) ?? 'Lesson'} moved to position ${finalIndex + 1} of ${nextIds.length}.`,
        );
      } catch {
        clearSession(true);
        dropTransition.reset();
        const message = 'Lesson order could not be saved.';
        setAnnouncement(message);
        onError(message);
      } finally {
        setPending(false);
      }
    },
    [onReorder, orderForMove, lessonNames, onError, orderedIds, clearSession, dropTransition],
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

  const projectedIds = useMemo(
    () =>
      dragState ? orderForMove(orderedIds, dragState.lessonId, dragState.targetIndex) : orderedIds,
    [dragState, orderedIds, orderForMove],
  );
  const { projectedTops, dropMarkerByLessonId } = useMemo(
    () =>
      lessonPathReorderPreview({
        orderedIds,
        projectedIds,
        dragState,
        slots: sessionRef.current?.slots,
        itemById,
      }),
    [dragState, orderedIds, projectedIds, itemById],
  );

  const touchContext = useRef<TouchReorderContext>(null!);
  touchContext.current = {
    enabled: enabled && !pending,
    sessionRef,
    suppressClickRef,
    elementsRef,
    orderedIds,
    lessonNames,
    clearSession,
    setDragState,
    setAnnouncement,
    targetIndexForY,
    persistOrder,
    holdDelay,
    orderForMove,
    dropTransition,
  };

  const interactionFor = useCallback(
    (rowId: string): LessonReorderInteraction => {
      const item = itemById.get(rowId);
      const lessonId = item?.dragId ?? rowId;
      let offset = { x: 0, y: 0 };
      const slots = sessionRef.current?.slots;
      if (dragState && slots) {
        if (dragState.lessonId === lessonId) {
          offset = { x: dragState.x ?? 0, y: dragState.y ?? 0 };
        } else {
          const from = slots.get(rowId);
          const top = projectedTops.get(rowId);
          if (from && top !== undefined) offset = { x: 0, y: top - from.top };
        }
      }
      if (dropTransition.offsets?.has(rowId))
        offset = { x: 0, y: dropTransition.offsets.get(rowId)! };
      const interactionEnabled = enabled && !pending && item?.draggable !== false;
      return {
        enabled: interactionEnabled,
        refused: !!dragState && dragState.lessonId === lessonId && !projectedIds,
        offset,
        lifted: dragState?.lessonId === lessonId && !dragState.dropping,
        settleVelocity: dropTransition.velocityFor(lessonId),
        direct: (dragState?.lessonId === lessonId && !dragState.dropping) || dropTransition.instant,
        dropMarker: dropMarkerByLessonId.get(rowId)?.edge,
        dropMarkerActive: dropMarkerByLessonId.get(rowId)?.active ?? false,
        registerElement: (element) => {
          touchCleanupRef.current.get(rowId)?.();
          touchCleanupRef.current.delete(rowId);
          if (!element) {
            elementsRef.current.delete(rowId);
            return;
          }
          elementsRef.current.set(rowId, element);

          if (item?.draggable !== false)
            touchCleanupRef.current.set(
              rowId,
              bindPathTouchReorder(element, lessonId, touchContext),
            );
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
          dropTransition.reset();
          const inputId = event.pointerId;
          const startX = event.clientX;
          const startY = event.clientY;
          const timer = holdDelay
            ? window.setTimeout(() => {
                const session = sessionRef.current;
                if (!session || session.inputId !== inputId) return;
                session.active = true;
                session.targetIndex = targetIndexForY(lessonId, session.clientY ?? startY);
                setDragState({
                  lessonId,
                  targetIndex: session.targetIndex,
                  x: 0,
                  y: (session.clientY ?? startY) - startY,
                });
                setAnnouncement(
                  `${lessonNames.get(lessonId) ?? 'Row'} lifted. Drag to a new position, then release.`,
                );
                hapticStrong();
              }, holdDelay)
            : 0;
          element.setPointerCapture?.(inputId);
          const scroller = element.closest('main') ?? document.documentElement;
          sessionRef.current = {
            lessonId,
            inputId,
            inputType: 'pointer',
            clientY: startY,
            scroller,
            scrollTop: scroller.scrollTop,
            scrollMax: scroller.scrollHeight - scroller.clientHeight,
            startX,
            startY,
            slots: capturePathSlots(elementsRef.current),
            targetOffsetY:
              rowId !== lessonId
                ? startY -
                  (elementsRef.current.get(lessonId)?.getBoundingClientRect().top ?? startY) -
                  (elementsRef.current.get(lessonId)?.getBoundingClientRect().height ?? 0) / 2
                : 0,
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
          const time = performance.now();
          session.velocity =
            ((event.clientY - (session.clientY ?? event.clientY)) /
              Math.max(1, time - (session.lastMoveTime ?? time))) *
            1000;
          session.lastMoveTime = time;
          session.clientY = event.clientY;
          if (!session.active) {
            if (holdDelay) return;
            const distance = Math.hypot(
              event.clientX - session.startX,
              event.clientY - session.startY,
            );
            if (distance <= EARLY_MOVE_LIMIT_PX) return;
            session.active = true;
            hapticStrong();
            setAnnouncement(
              `${lessonNames.get(lessonId) ?? 'Lesson'} lifted. Drag to a new position, then release.`,
            );
          }
          event.preventDefault();
          session.targetIndex = targetIndexForY(lessonId, event.clientY);
          setDragState({
            lessonId,
            targetIndex: session.targetIndex,
            x: holdDelay ? 0 : event.clientX - session.startX,
            y:
              event.clientY -
              session.startY +
              (session.scroller?.scrollTop ?? 0) -
              (session.scrollTop ?? 0),
          });
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
          if (active && holdDelay && orderForMove(orderedIds, lessonId, targetIndex)) {
            dropTransition.capture(
              lessonId,
              performance.now() - (session.lastMoveTime ?? 0) < 80 ? (session.velocity ?? 0) : 0,
            );
            window.clearTimeout(session.timer);
            if (session.element.hasPointerCapture?.(session.inputId))
              session.element.releasePointerCapture(session.inputId);
            session.active = false;
            setDragState((old) => (old ? { ...old, dropping: true } : old));
          } else clearSession(true);
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
          const delta = event.key === 'ArrowUp' ? -1 : 1;
          const targetIndex = keyboardTarget?.(lessonId, delta) ?? currentIndex + delta;
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
      itemById,
      projectedIds,
      projectedTops,
      dragState,
      dropMarkerByLessonId,
      enabled,
      lessonNames,
      orderedIds,
      pending,
      persistOrder,
      targetIndexForY,
      orderForMove,
      keyboardTarget,
      holdDelay,
      dropTransition,
    ],
  );

  /** Moves a lesson one place, as Alt and the arrow keys do, for the lesson actions menu. */
  const moveBy = useCallback(
    (lessonId: string, delta: -1 | 1) => {
      const targetIndex = keyboardTarget?.(lessonId, delta) ?? orderedIds.indexOf(lessonId) + delta;
      if (pending || targetIndex < 0 || targetIndex >= orderedIds.length) return;
      void persistOrder(lessonId, targetIndex);
    },
    [orderedIds, pending, persistOrder, keyboardTarget],
  );

  return { announcement, interactionFor, moveBy, pending };
}

/** Lesson-only callers retain their existing repository contract. */
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
  const items = useMemo(() => [...lessons].sort((a, b) => a.orderIndex - b.orderIndex), [lessons]);
  const onReorder = useCallback((ids: string[]) => reorderLessons(courseId, ids), [courseId]);
  return usePathReorder({ items, enabled, onError, onReorder });
}
