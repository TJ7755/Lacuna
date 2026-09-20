import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';

export interface SidebarDetail {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}

export function SidebarHoverCard({
  title,
  details,
  children,
}: {
  title: string;
  details?: SidebarDetail[];
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}) {
  const id = useId();
  const location = useLocation();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointerType = useRef('');
  const anchor = useRef<HTMLElement | null>(null);
  const popup = useRef<HTMLDivElement | null>(null);

  function clearTimer() {
    clearTimeout(timer.current);
  }
  function close() {
    clearTimer();
    setPosition(null);
  }
  function show(target: HTMLElement, delay: number) {
    clearTimer();
    if (!details?.length) return;
    anchor.current = target;
    timer.current = setTimeout(() => {
      if (!target.isConnected) return;
      const bounds = target.getBoundingClientRect();
      const edge = target.closest('aside')?.getBoundingClientRect().right ?? bounds.right;
      setPosition({
        left: Math.max(8, Math.min(edge + 8, window.innerWidth - 232)),
        top: Math.max(8, Math.min(bounds.top, window.innerHeight - 184)),
      });
    }, delay);
  }
  function hideSoon() {
    clearTimer();
    if (document.activeElement === anchor.current) return;
    timer.current = setTimeout(() => setPosition(null), 120);
  }

  useLayoutEffect(() => {
    if (!position || !anchor.current || !popup.current) return;
    const bounds = anchor.current.getBoundingClientRect();
    const height = popup.current.offsetHeight;
    const top = Math.max(8, Math.min(
      bounds.top + (bounds.height - height) / 2,
      window.innerHeight - height - 8,
    ));
    if (position.top !== top) setPosition({ ...position, top });
  }, [position]);

  useEffect(() => {
    clearTimeout(timer.current);
    setPosition(null);
    return () => clearTimeout(timer.current);
  }, [location.pathname]);

  useEffect(() => {
    if (!position) return;
    const dismiss = () => {
      clearTimeout(timer.current);
      setPosition(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [position]);

  const trigger = cloneElement(children, {
    title: details?.length ? undefined : children.props.title,
    'aria-label': children.props['aria-label'] ?? (details?.length ? title : undefined),
    'aria-describedby': position ? id : children.props['aria-describedby'],
    onPointerEnter: (event) => {
      children.props.onPointerEnter?.(event);
      if (event.pointerType !== 'touch' && matchMedia('(hover: hover)').matches)
        show(event.currentTarget, 180);
    },
    onPointerLeave: (event) => {
      children.props.onPointerLeave?.(event);
      hideSoon();
    },
    onPointerDown: (event) => {
      pointerType.current = event.pointerType;
      children.props.onPointerDown?.(event);
      if (event.pointerType === 'touch') close();
    },
    onFocus: (event) => {
      children.props.onFocus?.(event);
      if (pointerType.current !== 'touch' || event.currentTarget.matches(':focus-visible'))
        show(event.currentTarget, 0);
    },
    onBlur: (event) => {
      children.props.onBlur?.(event);
      close();
    },
    onClick: (event) => {
      close();
      children.props.onClick?.(event);
    },
  });

  return (
    <>
      {trigger}
      {createPortal(
        <AnimatePresence>
          {position && details && (
            <motion.div
              ref={popup}
              key={id}
              id={id}
              role="tooltip"
              initial={m > 0 ? { opacity: 0, x: -8, scale: 0.98 } : false}
              animate={m > 0 ? { opacity: 1, x: 0, scale: 1 } : undefined}
              exit={m > 0 ? { opacity: 0, x: -4 } : undefined}
              transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
              style={position}
              onPointerEnter={clearTimer}
              onPointerLeave={hideSoon}
              className="fixed z-[70] w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-4 shadow-lg shadow-black/10"
            >
              <p className="mb-3 truncate font-brand text-base text-ink">{title}</p>
              <dl className="space-y-2 text-xs">
                {details.map(({ icon, label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-ink-soft">
                      {icon}
                      {label}
                    </dt>
                    <dd className="whitespace-nowrap tabular-nums text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
