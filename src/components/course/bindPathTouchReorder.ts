import { capturePathSlots, type PathRowSlot } from './pathReorderLayout';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { hapticStrong } from '../../utils/haptic';
import type { usePathDropTransition } from './usePathDropTransition';

export interface DragSession {
  lessonId: string;
  inputId: number;
  inputType: 'pointer' | 'touch';
  startX: number;
  startY: number;
  slots: Map<string, PathRowSlot>;
  targetOffsetY?: number;
  element: HTMLButtonElement;
  timer: number;
  active: boolean;
  targetIndex: number;
  clientY?: number;
  lastMoveTime?: number;
  velocity?: number;
  scrollTop?: number;
  scrollMax?: number;
  scroller?: HTMLElement;
}

export interface DragState {
  dropping?: boolean;
  lessonId: string;
  x?: number;
  y?: number;
  targetIndex: number;
}

export interface TouchReorderContext {
  enabled: boolean;
  sessionRef: RefObject<DragSession | null>;
  suppressClickRef: RefObject<{ lessonId: string; until: number } | null>;
  elementsRef: RefObject<Map<string, HTMLButtonElement>>;
  orderedIds: string[];
  lessonNames: Map<string, string>;
  clearSession: (release: boolean) => void;
  setDragState: Dispatch<SetStateAction<DragState | null>>;
  setAnnouncement: Dispatch<SetStateAction<string>>;
  targetIndexForY: (id: string, y: number) => number;
  persistOrder: (id: string, index: number) => Promise<void>;
  holdDelay: number;
  orderForMove: (ids: string[], id: string, index: number) => string[] | null;
  dropTransition: ReturnType<typeof usePathDropTransition>;
}

/** Native non-passive movement is needed to claim scrolling only after the touch hold. */
export function bindPathTouchReorder(
  element: HTMLButtonElement,
  lessonId: string,
  context: RefObject<TouchReorderContext>,
) {
  const row = element.closest('li');
  const touchTarget: HTMLElement =
    row && row.querySelectorAll('[data-path-row]').length > 1 ? row : element;
  const touchFor = (touches: TouchList, inputId: number): Touch | undefined => {
    for (let index = 0; index < touches.length; index++) {
      const touch = touches[index];
      if (touch?.identifier === inputId) return touch;
    }
    return undefined;
  };
  const startTouch = (event: TouchEvent) => {
    if (touchTarget !== element && !(event.target as Element).closest('[data-path-row]')) return;
    const {
      enabled: interactionEnabled,
      sessionRef,
      suppressClickRef,
      elementsRef,
      dropTransition,
    } = context.current;
    if (!interactionEnabled || event.touches.length !== 1 || sessionRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    // A new physical gesture cannot be the synthetic click belonging to
    // the preceding drop, so it must never inherit that suppression.
    suppressClickRef.current = null;
    dropTransition.reset();
    const inputId = touch.identifier;
    const timer = window.setTimeout(() => {
      const { sessionRef, orderedIds, setDragState, setAnnouncement, lessonNames } =
        context.current;
      const session = sessionRef.current;
      if (!session || session.inputType !== 'touch' || session.inputId !== inputId) return;
      session.active = true;
      const originalIndex = orderedIds.indexOf(lessonId);
      session.targetIndex = Math.max(originalIndex, 0);
      setDragState({ lessonId, targetIndex: session.targetIndex });
      setAnnouncement(
        `${lessonNames.get(lessonId) ?? 'Lesson'} lifted. Drag to a new position, then release.`,
      );
      hapticStrong();
    }, 350);
    const scroller = element.closest('main') ?? document.documentElement;
    sessionRef.current = {
      lessonId,
      inputId,
      inputType: 'touch',
      clientY: touch.clientY,
      scroller,
      scrollTop: scroller.scrollTop,
      scrollMax: scroller.scrollHeight - scroller.clientHeight,
      startX: touch.clientX,
      startY: touch.clientY,
      slots: capturePathSlots(elementsRef.current),
      targetOffsetY:
        element !== elementsRef.current.get(lessonId)
          ? touch.clientY -
            (elementsRef.current.get(lessonId)?.getBoundingClientRect().top ?? touch.clientY) -
            (elementsRef.current.get(lessonId)?.getBoundingClientRect().height ?? 0) / 2
          : 0,
      element,
      timer,
      active: false,
      targetIndex: 0,
    };
  };
  const moveTouch = (event: TouchEvent) => {
    const { sessionRef, clearSession, setDragState, targetIndexForY } = context.current;
    const session = sessionRef.current;
    if (!session || session.inputType !== 'touch' || session.lessonId !== lessonId) return;
    const touch = touchFor(event.touches, session.inputId);
    if (!touch) return;
    const time = performance.now();
    session.velocity =
      ((touch.clientY - (session.clientY ?? touch.clientY)) /
        Math.max(1, time - (session.lastMoveTime ?? time))) *
      1000;
    session.lastMoveTime = time;
    session.clientY = touch.clientY;
    if (!session.active) {
      const distance = Math.hypot(touch.clientX - session.startX, touch.clientY - session.startY);
      if (distance > 8) clearSession(false);
      // Deliberately do not preventDefault: movement before the hold is
      // an ordinary vertical scroll, not a failed drag.
      return;
    }
    event.preventDefault();
    session.targetIndex = targetIndexForY(lessonId, touch.clientY);
    setDragState({
      lessonId,
      targetIndex: session.targetIndex,
      x: 0,
      y:
        touch.clientY -
        session.startY +
        (session.scroller?.scrollTop ?? 0) -
        (session.scrollTop ?? 0),
    });
  };
  const endTouch = (event: TouchEvent) => {
    const {
      sessionRef,
      clearSession,
      setDragState,
      persistOrder,
      holdDelay,
      orderForMove,
      orderedIds,
      dropTransition,
      suppressClickRef,
    } = context.current;
    const session = sessionRef.current;
    if (!session || session.inputType !== 'touch' || session.lessonId !== lessonId) return;
    if (!touchFor(event.changedTouches, session.inputId)) return;
    const targetIndex = session.targetIndex;
    const active = session.active;
    if (active) event.preventDefault();
    if (active && holdDelay && orderForMove(orderedIds, lessonId, targetIndex)) {
      dropTransition.capture(
        lessonId,
        performance.now() - (session.lastMoveTime ?? 0) < 80 ? (session.velocity ?? 0) : 0,
      );
      session.active = false;
      setDragState((old) => (old ? { ...old, dropping: true } : old));
    } else clearSession(false);
    if (!active) return;
    // Suppress only the compatibility click generated by this completed
    // drag. The timeout is measured from drop, so a long drag cannot
    // outlive it; any new pointer/touch start clears it immediately.
    suppressClickRef.current = { lessonId, until: Date.now() + 750 };
    void persistOrder(lessonId, targetIndex);
  };
  const cancelTouch = (event: TouchEvent) => {
    const { sessionRef, clearSession, suppressClickRef, setAnnouncement, lessonNames } =
      context.current;
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
  touchTarget.addEventListener('touchstart', startTouch, { passive: true });
  touchTarget.addEventListener('touchmove', moveTouch, { passive: false });
  touchTarget.addEventListener('touchend', endTouch, { passive: false });
  touchTarget.addEventListener('touchcancel', cancelTouch, { passive: true });
  const cleanup = () => {
    touchTarget.removeEventListener('touchstart', startTouch);
    touchTarget.removeEventListener('touchmove', moveTouch);
    touchTarget.removeEventListener('touchend', endTouch);
    touchTarget.removeEventListener('touchcancel', cancelTouch);
  };

  return cleanup;
}
