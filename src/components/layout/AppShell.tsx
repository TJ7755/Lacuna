import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { Sidebar } from './Sidebar';
import { Titlebar } from './Titlebar';
import { ErrorBoundary } from './ErrorBoundary';
import { CommandPalette } from '../search/CommandPalette';
import { StudySheet } from '../learn/StudySheet';
import { StudySheetProvider, useStudySheetState } from '../learn/StudySheetContext';
import { CourseSectionBar } from '../course/CourseSectionBar';
import { courseIdFromPath } from '../course/courseSections';
import { cn } from '../ui/cn';
import { useCourseSectionSwipe } from '../course/useCourseSectionSwipe';
import { KeyHints } from '../ui/KeyHints';
import { CloseIcon, LacunaIcon } from '../ui/icons';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { consumeLandingArrival } from './LandingTransition';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const COLLAPSE_KEY = 'lacuna-sidebar-collapsed';
const WIDE_DESKTOP_QUERY = '(min-width: 1280px)';

/** Sideways for a move between course sections, the standard lift otherwise. */
const ROUTE_VARIANTS = {
  enter: (direction: number) =>
    direction === 0 ? { opacity: 0, y: 12, scale: 0.995 } : { opacity: 0, x: 32 * direction },
  center: { opacity: 1, x: 0, y: 0, scale: 1 },
  exit: (direction: number) =>
    direction === 0 ? { opacity: 0, y: -8, scale: 0.995 } : { opacity: 0, x: -32 * direction },
};

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  // Sync sidebar collapsed state across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === COLLAPSE_KEY) {
        setCollapsed(e.newValue === '1');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wideDesktop, setWideDesktop] = useState(
    () => window.matchMedia?.(WIDE_DESKTOP_QUERY).matches ?? true,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hintsOpen, setHintsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const mainRef = useRef<HTMLElement>(null);
  const appContentRef = useRef<HTMLDivElement>(null);
  const titlebarRef = useRef<HTMLDivElement>(null);
  const bottomNavRef = useRef<HTMLDivElement>(null);
  const shellBodyRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileWasOpenRef = useRef(false);
  const mobileDrawerRef = useFocusTrap(mobileOpen, {
    autoFocusSelector: '[data-mobile-close]',
    returnFocus: false,
  });
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [arrivedFromLanding] = useState(() => consumeLandingArrival());
  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, sectionDirection } =
    useCourseSectionSwipe();
  // The section bar only exists inside a course, so only those pages need to clear it.
  const inCourse = courseIdFromPath(location.pathname) !== null;
  const studySheet = useStudySheetState();

  // Keep an icon rail visible on narrower desktop windows instead of spending a
  // quarter of the viewport on the full sidebar. The user's preference resumes
  // once there is enough room for the expanded navigation.
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_DESKTOP_QUERY);
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setWideDesktop(event.matches);
    setWideDesktop(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Debounce sidebar collapse writes so rapid toggles / drag-resize don't hammer localStorage.
  useEffect(() => {
    const id = window.setTimeout(() => {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    }, 150);
    return () => window.clearTimeout(id);
  }, [collapsed]);

  // Each page change starts at the top, so the entrance animation reveals the new
  // page from its header rather than from wherever the last one was scrolled to.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Keep the page behind either modal surface out of both keyboard navigation and
  // the accessibility tree until the overlay closes. The course section bar is a
  // sibling of the shell body, so it must be included explicitly rather than relying
  // on the body region's inert attribute.
  useEffect(() => {
    const background = [
      titlebarRef.current,
      bottomNavRef.current,
      ...(paletteOpen ? [shellBodyRef.current] : mobileOpen ? [appContentRef.current] : []),
    ].filter((element): element is HTMLDivElement => element !== null);
    if (!mobileOpen && !paletteOpen) return;
    background.forEach((element) => element.setAttribute('inert', ''));
    return () => background.forEach((element) => element.removeAttribute('inert'));
  }, [mobileOpen, paletteOpen]);

  // Restore focus after the inert attribute has been removed. Returning it from
  // the trap cleanup is too early: browsers correctly refuse to focus an inert
  // trigger.
  useEffect(() => {
    if (mobileWasOpenRef.current && !mobileOpen) {
      mobileTriggerRef.current?.focus();
    }
    mobileWasOpenRef.current = mobileOpen;
  }, [mobileOpen]);

  // Global shortcuts within the shell: Ctrl/Cmd+K (palette), / (search), ? (help).
  // Single-key shortcuts stay inert while typing so they never hijack a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      )
        return;
      if (e.key === '?') {
        e.preventDefault();
        setHintsOpen((v) => !v);
      } else if (e.key === '/') {
        e.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    // Arriving from the landing page's Get Started transition, the shell
    // settles up from slightly under scale while the overlay halves part.
    <motion.div
      initial={arrivedFromLanding ? { scale: 0.96 } : false}
      animate={{ scale: 1 }}
      transition={{ duration: 0.7 * m, delay: 0.3 * m, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-screen overflow-hidden flex-col"
    >
      <div ref={titlebarRef} className="shrink-0">
        <Titlebar />
      </div>
      <div ref={shellBodyRef} className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar
            collapsed={!wideDesktop || collapsed}
            onToggleCollapsed={() => setCollapsed((c) => !c)}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenStudySheet={() => studySheet.value.openStudySheet()}
            collapseControl={wideDesktop}
          />
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              className="fixed inset-0 z-40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setMobileOpen(false)}
              />
              <motion.div
                ref={mobileDrawerRef}
                className="absolute inset-y-0 left-0"
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setMobileOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  data-mobile-close
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  title="Close navigation (Esc)"
                  className="absolute right-3 top-3 z-30 flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
                >
                  <CloseIcon width={18} height={18} />
                </button>
                <Sidebar
                  collapsed={false}
                  onToggleCollapsed={() => setMobileOpen(false)}
                  toggleLabel="Close navigation"
                  onOpenPalette={() => {
                    setMobileOpen(false);
                    setPaletteOpen(true);
                  }}
                  onOpenStudySheet={() => {
                    setMobileOpen(false);
                    studySheet.value.openStudySheet();
                  }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={appContentRef}
          aria-hidden={mobileOpen || undefined}
          className="flex min-w-0 flex-1 flex-col"
        >
          {/* Mobile top bar */}
          <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
            <button
              ref={mobileTriggerRef}
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft hover:bg-ink/5 active:bg-ink/10"
            >
              <span className="flex flex-col gap-1">
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
              </span>
            </button>
            <span className="flex items-center gap-2 font-display text-lg">
              <LacunaIcon width={18} height={18} className="text-accent" />
              Lacuna
            </span>
          </div>

          <main
            ref={mainRef}
            // Bottom padding clears the mobile navigation bar, which is fixed and would
            // otherwise cover the last of the page's content.
            className={cn(
              'min-w-0 flex-1 overflow-y-auto overscroll-y-none',
              inCourse && 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0',
            )}
            style={{ touchAction: 'pan-y' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <ErrorBoundary label="this page">
              {/* Ordinary navigation fades, scales and lifts in as the previous page settles
                  out. Moving between a course's sections slides sideways instead, in the
                  direction of travel through the tab order, so the sections read as one
                  surface rather than as unrelated pages.

                  The direction goes through AnimatePresence's `custom` rather than being
                  baked into the props, because an exiting element otherwise keeps the props
                  it last rendered with and would leave towards the wrong side. */}
              <AnimatePresence initial={false} custom={sectionDirection}>
                <motion.div
                  key={location.pathname}
                  custom={sectionDirection}
                  variants={ROUTE_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22 * m, ease: [0.16, 1, 0.3, 1] }}
                >
                  <StudySheetProvider value={studySheet.value}>{outlet}</StudySheetProvider>
                </motion.div>
              </AnimatePresence>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <div ref={bottomNavRef}>
        <CourseSectionBar />
        <AnimatePresence>
          {studySheet.open && (
            <StudySheet courseId={studySheet.courseId} onClose={studySheet.close} />
          )}
        </AnimatePresence>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <KeyHints open={hintsOpen} onClose={() => setHintsOpen(false)} />
    </motion.div>
  );
}
