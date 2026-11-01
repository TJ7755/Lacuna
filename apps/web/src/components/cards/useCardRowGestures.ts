import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotionValue, useSpring, useTransform } from 'motion/react';
import type { Card } from '../../db/types';
import { useIsTouchMode } from '../../state/inputMode';
import { hapticLight, hapticMedium } from '../../utils/haptic';
import { scaledSpring } from '../ui/motion';

export function useCardRowGestures({
  card,
  selectMode,
  expanded,
  generated,
  linked,
  onToggle,
  onToggleExpand,
  onToggleFlag,
  onEdit,
  onDelete,
  onUnlink,
  onResume,
  m,
}: {
  card: Card;
  selectMode: boolean;
  expanded: boolean;
  generated: boolean;
  linked: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
  onToggleFlag: (card: Card) => void;
  onEdit: () => void;
  onDelete: () => void;
  onUnlink: () => void;
  onResume: () => void;
  m: number;
}) {
  const isTouchMode = useIsTouchMode();

  // Swipe-to-reveal state — multi-directional in touch mode.
  const [trayOpen, setTrayOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragX = useMotionValue(0);
  useEffect(() => {
    if (selectMode || expanded) {
      setTrayOpen(false);
      dragX.set(0);
    }
  }, [selectMode, expanded, dragX]);
  const springX = useSpring(
    dragX,
    m > 0 ? { ...scaledSpring(m, 420, 30), mass: 0.8 } : { duration: 0 },
  );
  // The tray shows only once the row moves left: at rest its tinted buttons would
  // otherwise show through the row's rounded corners.
  const trayVisibility = useTransform(springX, (x) => (x < -0.5 ? 'visible' : 'hidden'));
  const swipeState = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    isSwipe: false,
    openBeforeDrag: false,
  });
  const trayWidth = 220;
  const swipeThreshold = 40;
  const MAX_DRAG = 120;

  // Refs for stable callback dependencies
  const trayOpenRef = useRef(trayOpen);
  const cardRefForCallback = useRef(card);
  useEffect(() => {
    trayOpenRef.current = trayOpen;
  }, [trayOpen]);
  useEffect(() => {
    cardRefForCallback.current = card;
  }, [card]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (selectMode || expanded) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button:not([data-card-details]), a, [role="button"]')) return;
      e.stopPropagation();
      const presentedX = m === 0 ? dragX.get() : springX.get();
      dragX.jump(presentedX);
      springX.jump(presentedX);
      swipeState.current = {
        dragging: true,
        startX: e.clientX - presentedX + (trayOpenRef.current ? -trayWidth : 0),
        startY: e.clientY,
        isSwipe: false,
        openBeforeDrag: trayOpenRef.current,
      };
      cardRef.current?.setPointerCapture(e.pointerId);
    },
    [selectMode, expanded, dragX, springX, m],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!swipeState.current.dragging) return;
      const dx = e.clientX - swipeState.current.startX;
      const dy = e.clientY - swipeState.current.startY;

      if (!swipeState.current.isSwipe && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        swipeState.current.isSwipe = true;
      }
      if (!swipeState.current.isSwipe) return;

      e.preventDefault();

      // If tray was already open, dragging right closes it; dragging left keeps it open.
      // If tray was closed, dragging left opens it; dragging right triggers quick flag.
      const base = swipeState.current.openBeforeDrag ? -trayWidth : 0;
      const clamped = Math.max(-trayWidth, Math.min(isTouchMode ? MAX_DRAG : 0, base + dx));
      dragX.set(clamped);
      springX.jump(clamped);
    },
    [dragX, springX, isTouchMode],
  );

  const justHandledTap = useRef(false);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!swipeState.current.dragging) return;
      cardRef.current?.releasePointerCapture(e.pointerId);
      swipeState.current.dragging = false;
      const wasSwipe = swipeState.current.isSwipe;
      swipeState.current.isSwipe = false;

      if (wasSwipe) {
        e.stopPropagation();
        justHandledTap.current = true;
        const currentX = dragX.get();
        // If open before drag, drag right to close; if closed, drag left to open.
        if (swipeState.current.openBeforeDrag) {
          // Tray was open — close if dragged right past threshold
          if (currentX > -trayWidth + swipeThreshold) {
            setTrayOpen(false);
            dragX.set(0);
          } else {
            setTrayOpen(true);
            dragX.set(-trayWidth);
          }
        } else {
          // Tray was closed
          if (currentX < -swipeThreshold) {
            // Drag left — open tray
            hapticLight();
            setTrayOpen(true);
            dragX.set(-trayWidth);
          } else if (isTouchMode && currentX > swipeThreshold) {
            // Drag right — quick flag (touch mode only)
            hapticLight();
            dragX.set(0);
            onToggleFlag(cardRefForCallback.current);
          } else {
            setTrayOpen(false);
            dragX.set(0);
          }
        }
      } else {
        // It was a tap — close the tray if it is open; suppress the subsequent click.
        if (trayOpenRef.current) {
          hapticLight();
          justHandledTap.current = true;
          setTrayOpen(false);
          dragX.set(0);
        }
      }
    },
    [dragX, isTouchMode, onToggleFlag],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      cardRef.current?.releasePointerCapture(e.pointerId);
      swipeState.current.dragging = false;
      swipeState.current.isSwipe = false;
      dragX.set(trayOpenRef.current ? -trayWidth : 0);
    },
    [dragX],
  );

  const handleClick = useCallback(() => {
    if (justHandledTap.current) {
      justHandledTap.current = false;
      return;
    }
    if (selectMode && !generated && !linked) {
      onToggle();
    } else if (trayOpenRef.current) {
      setTrayOpen(false);
      dragX.set(0);
    } else {
      onToggleExpand();
    }
  }, [selectMode, generated, linked, onToggle, onToggleExpand, dragX]);

  const handleFlagClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hapticLight();
      onToggleFlag(cardRefForCallback.current);
    },
    [onToggleFlag],
  );

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hapticLight();
      onEdit();
    },
    [onEdit],
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hapticMedium();
      onDelete();
    },
    [onDelete],
  );

  const handleUnlinkClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hapticLight();
      onUnlink();
    },
    [onUnlink],
  );

  const handleResumeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onResume();
    },
    [onResume],
  );

  const handleFlagHoverClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFlag(cardRefForCallback.current);
    },
    [onToggleFlag],
  );

  const handleExpandedClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return {
    trayOpen,
    cardRef,
    dragX,
    springX,
    trayVisibility,
    trayWidth,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClick,
    handleFlagClick,
    handleEditClick,
    handleDeleteClick,
    handleUnlinkClick,
    handleResumeClick,
    handleFlagHoverClick,
    handleExpandedClick,
  };
}
