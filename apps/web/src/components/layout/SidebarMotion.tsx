import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { MOTION_EASING } from '../ui/motion';
import { cn } from '../ui/cn';

const SidebarMotionContext = createContext({
  collapsed: false,
  drawer: true,
  multiplier: 0,
  moving: false,
});
export const useSidebarMotion = () => useContext(SidebarMotionContext);

function sidebarWidthTransition(multiplier: number) {
  return `${0.28 * multiplier}s cubic-bezier(${MOTION_EASING.standard.join(',')})`;
}

export function SidebarFrame({
  collapsed,
  drawer,
  multiplier,
  children,
  ...props
}: {
  collapsed: boolean;
  drawer: boolean;
  multiplier: number;
  children: ReactNode;
} & ComponentProps<'aside'>) {
  const previous = useRef(collapsed);
  const [moving, setMoving] = useState(false);
  useLayoutEffect(() => {
    const changed = previous.current !== collapsed;
    previous.current = collapsed;
    if (!changed || drawer || multiplier === 0) {
      setMoving(false);
      return;
    }
    setMoving(true);
    // Also release suppression if a rapid reversal cancels the CSS transition.
    const timer = setTimeout(() => setMoving(false), 280 * multiplier);
    return () => clearTimeout(timer);
  }, [collapsed, drawer, multiplier]);

  return (
    <SidebarMotionContext value={{ collapsed, drawer, multiplier, moving }}>
      <aside
        {...props}
        data-sidebar-moving={moving || undefined}
        style={{
          width: `calc(${collapsed ? 72 : 264}px + env(safe-area-inset-left))`,
          overflowX: drawer ? undefined : 'clip',
          transition: drawer ? undefined : `width ${sidebarWidthTransition(multiplier)}`,
        }}
      >
        {children}
      </aside>
    </SidebarMotionContext>
  );
}

/** Retain the same text and controls whilst the sidebar edge clips their fixed geometry. */
export function SidebarLabel({ className, style, ...props }: ComponentProps<'span'>) {
  const { collapsed, drawer, multiplier } = useSidebarMotion();
  return (
    <span
      {...props}
      aria-hidden={collapsed || undefined}
      inert={collapsed}
      className={cn('whitespace-nowrap', !drawer && 'shrink-0', className)}
      style={{
        ...style,
        opacity: collapsed ? 0 : 1,
        pointerEvents: collapsed ? 'none' : undefined,
        transition: `opacity ${(collapsed ? 0.12 : 0.18) * multiplier}s ease ${collapsed ? 0 : 0.06 * multiplier}s`,
      }}
    />
  );
}
