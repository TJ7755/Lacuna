import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { m as motion, useIsPresent } from 'motion/react';
import { createPortal } from 'react-dom';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring } from '../ui/motion';
import { StudyActionIcon } from './StudyActionIcon';

import { beginStudyTransition } from '../layout/LandingTransition';

const StudyLaunchContext = createContext<(navigate: () => void) => void>((navigate) => navigate());
export const useStudyLaunch = () => useContext(StudyLaunchContext);

/** The Study surface grows from its trigger without obscuring the surrounding course. */
export function StudyExpansion({
  anchor,
  onClose,
  onCancelLaunch,
  children,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  onCancelLaunch?: () => void;
  children: ReactNode;
}) {
  const [launching, setLaunching] = useState(false);
  const launchingRef = useRef(false);
  // Presence updates during retained exits, so the portal can yield to Other ways' z-30 wrapper.
  const present = useIsPresent();
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [origin] = useState(() => anchor.getBoundingClientRect());
  const [originColours] = useState(() => {
    const style = getComputedStyle(anchor);
    return { backgroundColor: style.backgroundColor, color: style.color };
  });
  const [triggerFontSize] = useState(() => getComputedStyle(anchor).fontSize);
  const [headerInk, setHeaderInk] = useState(originColours.color);
  const [bounds, setBounds] = useState(() => ({
    left: origin.left,
    top: origin.top,
    width: origin.width,
    height: origin.height,
  }));
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const width = Math.min(448, window.innerWidth - 32);
  const returnFocus = useRef(true);
  const [anchorVisibility] = useState(() => anchor.style.visibility);

  useLayoutEffect(() => {
    if (surface.current) setHeaderInk(getComputedStyle(surface.current).color);
    const element = content.current;
    if (!element) return;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(448, window.innerWidth - 32);
      const height = Math.min(element.scrollHeight + 44, window.innerHeight - 32);
      setBounds({
        left: Math.max(16, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 16)),
        top: Math.max(16, Math.min(rect.top, window.innerHeight - height - 16)),
        width: panelWidth,
        height,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor]);

  useLayoutEffect(() => {
    const opacity = anchor.style.opacity;
    anchor.style.opacity = '0';
    return () => {
      anchor.style.opacity = opacity;
      anchor.style.visibility = anchorVisibility;
    };
  }, [anchor, anchorVisibility]);

  useLayoutEffect(() => {
    if (!present || launching) return;
    returnFocus.current = true;
    anchor.style.visibility = 'hidden';
    anchor.setAttribute('aria-expanded', 'true');
    content.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!surface.current?.contains(event.target as Node)) {
        returnFocus.current = false;
        onClose();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        returnFocus.current = true;
        onClose();
      }
    };
    const focusOutside = (event: FocusEvent) => {
      if (!surface.current?.contains(event.target as Node)) {
        returnFocus.current = false;
        onClose();
      }
    };
    document.addEventListener('focusin', focusOutside);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      anchor.style.visibility = anchorVisibility;
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('focusin', focusOutside);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
      if (returnFocus.current && anchor.isConnected) anchor.focus();
    };
  }, [anchor, anchorVisibility, onClose, present, launching]);

  return createPortal(
    <motion.div
      ref={surface}
      data-expanding-action="study"
      role="region"
      aria-label="Session preview"
      inert={!present || launching}
      aria-hidden={!present || undefined}
      initial={
        multiplier > 0
          ? {
              left: origin.left,
              top: origin.top,
              width: origin.width,
              height: origin.height,
              borderRadius: origin.height / 2,
            }
          : false
      }
      animate={{
        ...bounds,
        borderRadius: 24,
        opacity: launching ? 0 : 1,
      }}
      exit={{
        left: origin.left,
        top: origin.top,
        width: origin.width,
        height: origin.height,
        borderRadius: origin.height / 2,
      }}
      transition={{
        ...expandingActionSpring(multiplier),
        opacity: { duration: 0.09 * multiplier },
      }}
      style={
        launching
          ? {
              zIndex: 101,
              backgroundColor: 'transparent',
              boxShadow: 'none',
              pointerEvents: 'none',
            }
          : { zIndex: present ? 50 : 20 }
      }
      className="fixed z-50 overflow-hidden bg-surface-raised text-ink card-surface"
    >
      <motion.button
        type="button"
        aria-label="Close session preview"
        onClick={onClose}
        onPointerDown={() => {
          returnFocus.current = false;
        }}
        data-press="none"
        initial={multiplier > 0 ? originColours : false}
        animate={{
          backgroundColor: 'rgba(0, 0, 0, 0)',
          color: headerInk,
          opacity: launching ? 0 : 1,
        }}
        exit={originColours}
        transition={{
          ...expandingActionSpring(multiplier),
          opacity: { duration: 0.09 * multiplier },
          backgroundColor: { duration: 0.18 * multiplier, ease: 'linear' },
          color: { duration: 0.18 * multiplier, ease: 'linear' },
        }}
        className="absolute right-0 top-0 z-10 flex select-none min-h-11 items-center justify-center gap-2 px-3 text-sm font-semibold focus-visible:outline-offset-[-3px]"
        style={{
          width: origin.width,
          height: origin.height,
          borderRadius: origin.height / 2,
          fontSize: triggerFontSize,
        }}
      >
        <span className="inline-flex items-center gap-2">
          <span>Study</span>
          <StudyActionIcon open={present} multiplier={multiplier} />
        </span>
      </motion.button>
      {/* Keep the final-width body still while the shell reveals it towards the left. */}
      <div className="absolute right-0 top-0 pt-11 text-ink" style={{ width }}>
        <div className="max-h-[calc(100dvh-76px)] overflow-y-auto">
          <motion.div
            ref={content}
            className="p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: present && !launching ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: (launching ? 0.09 : 0.12) * multiplier }}
          >
            <StudyLaunchContext.Provider
              value={(navigate) => {
                const element = surface.current;
                if (!element || multiplier === 0) {
                  navigate();
                  return;
                }
                if (launchingRef.current) return;
                launchingRef.current = true;
                returnFocus.current = false;
                const style = getComputedStyle(element);
                beginStudyTransition(
                  element.getBoundingClientRect(),
                  {
                    colour: style.backgroundColor,
                    radius: style.borderRadius,
                    paper: `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()})`,
                  },
                  navigate,
                  onCancelLaunch
                    ? () => {
                        launchingRef.current = false;
                        setLaunching(false);
                        returnFocus.current = true;
                        onCancelLaunch();
                        if (anchor.isConnected) anchor.focus();
                      }
                    : undefined,
                );
                setLaunching(true);
              }}
            >
              {children}
            </StudyLaunchContext.Provider>
          </motion.div>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
