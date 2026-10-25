import { ModalBackdrop } from '../ui/ModalBackdrop';
import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { ShellCourseDataProvider } from '../../state/ShellCourseData';
import {
  CourseNavigationDataProvider,
  useNavigationCourses,
} from '../../state/CourseNavigationData';
import { useIdleRoutePrefetch } from '../../routes/useIdleRoutePrefetch';
import { Sidebar } from './Sidebar';
import { Titlebar } from './Titlebar';
import { useScrollMemory } from './scrollMemory';
import { RouteTransitions } from './RouteTransitions';
import { ErrorBoundary } from './ErrorBoundary';
import { OverlayLoadBoundary } from './OverlayLoadBoundary';
import { StudySheetProvider, useStudySheetState } from '../learn/StudySheetContext';
import { CourseSectionBar } from '../course/CourseSectionBar';
import { courseIdFromPath } from '../course/courseSections';
import { cn } from '../ui/cn';
import { useCourseSectionSwipe } from '../course/useCourseSectionSwipe';
import { CloseIcon, LacunaIcon } from '../ui/icons';
import { scaledSpring } from '../ui/motion';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { consumeLandingArrival } from './LandingTransition';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useMobileNavigationSwipe } from './useMobileNavigationSwipe';
import { FinalExamLifecycleController } from '../course/FinalExamLifecycleController';
import { keyMatches, loadBindings } from '../../state/shortcutBindings';

const CommandPalette = lazy(() =>
  import('../search/CommandPalette').then((module) => ({ default: module.CommandPalette })),
);
const StudySheet = lazy(() =>
  import('../learn/StudySheet').then(({ StudySheet }) => ({ default: StudySheet })),
);
const KeyHints = lazy(() =>
  import('../ui/KeyHints').then(({ KeyHints }) => ({ default: KeyHints })),
);

const COLLAPSE_KEY = 'lacuna-sidebar-collapsed';
const WIDE_DESKTOP_QUERY = '(min-width: 1280px)';

export function AppShell() {
  const { pathname } = useLocation();
  return (
    <CourseNavigationDataProvider>
      <ShellCourseDataProvider includeDashboard={pathname === '/'}>
        <AppShellLayout />
      </ShellCourseDataProvider>
    </CourseNavigationDataProvider>
  );
}

function AppShellLayout() {
  const navigationCourses = useNavigationCourses();
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
  const [hintsLoaded, setHintsLoaded] = useState(false);
  const location = useLocation();
  useIdleRoutePrefetch(
    location.pathname === '/'
      ? (navigationCourses ?? [])
          .filter((course) => !course.archived)
          .slice(0, 1)
          .map((course) => `/course/${course.id}`)
      : [],
  );
  const navigate = useNavigate();
  const outlet = useOutlet();
  const mainRef = useRef<HTMLElement>(null);
  const appContentRef = useRef<HTMLDivElement>(null);
  const titlebarRef = useRef<HTMLDivElement>(null);
  const bottomNavRef = useRef<HTMLDivElement>(null);
  const shellBodyRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileWasOpenRef = useRef(false);
  const paletteReturnFocusRef = useRef<HTMLElement | null>(null);
  const mobileDrawerRef = useFocusTrap(mobileOpen, {
    autoFocusSelector: '[data-mobile-close]',
    returnFocus: false,
  });
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const motionEnabled = m > 0;
  const [arrivedFromLanding] = useState(() => consumeLandingArrival());
  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, sectionDirection } =
    useCourseSectionSwipe();
  // The section bar only exists inside a course, so only those pages need to clear it.
  const inCourse = courseIdFromPath(location.pathname) !== null;
  const studySheet = useStudySheetState();
  const mobileNavigationSwipe = useMobileNavigationSwipe({
    enabled: !mobileOpen && !paletteOpen && !hintsOpen && !studySheet.open,
    onOpen: () => setMobileOpen(true),
  });

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

  // New pages start at the top; returning to a page puts it back where it was left.
  useScrollMemory(mainRef);

  useEffect(
    () =>
      window.electronAPI?.onMenuCommand?.((command) => {
        if (command === 'help') void navigate('/help');
        else if (command === 'settings') void navigate('/settings');
        else {
          setHintsLoaded(true);
          setHintsOpen(true);
        }
      }),
    [navigate],
  );

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
    if (mobileWasOpenRef.current && !mobileOpen && !paletteOpen) {
      mobileTriggerRef.current?.focus();
    }
    mobileWasOpenRef.current = mobileOpen;
  }, [mobileOpen, paletteOpen]);

  // Global shortcuts: Ctrl/Cmd+K (quick search), / (content search), configured help key.
  // Single-key shortcuts stay inert while typing so they never hijack a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!paletteOpen) {
          paletteReturnFocusRef.current = mobileOpen
            ? mobileTriggerRef.current
            : document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          setMobileOpen(false);
        }
        setPaletteOpen(!paletteOpen);
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
      if (keyMatches(e, loadBindings().help)) {
        e.preventDefault();
        setHintsLoaded(true);
        setHintsOpen((v) => !v);
      } else if (e.key === '/') {
        e.preventDefault();
        void navigate('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, mobileOpen, paletteOpen]);

  return (
    // Arriving from the landing page's Get Started transition, the shell
    // settles up from slightly under scale while the accent cover lifts.
    // Skip the scale entirely otherwise — a standing transform here would pin
    // every `position: fixed` descendant to this wrapper.
    <motion.div
      initial={arrivedFromLanding && motionEnabled ? { scale: 0.975 } : false}
      animate={arrivedFromLanding && motionEnabled ? { scale: 1 } : undefined}
      transition={{ type: 'spring', duration: 0.32 * m, bounce: 0 }}
      className="flex h-screen overflow-hidden flex-col"
    >
      {/* First stop for keyboard users: past the sidebar's courses to the page itself. */}
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          // Hash routing owns the URL fragment, so move focus rather than navigate.
          event.preventDefault();
          const main = mainRef.current!;
          main.tabIndex = -1;
          main.focus();
        }}
      >
        Skip to content
      </a>
      <div ref={titlebarRef} className="shrink-0">
        <Titlebar />
      </div>
      <div ref={shellBodyRef} className="relative flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar
            collapsed={!wideDesktop || collapsed}
            onToggleCollapsed={() => setCollapsed((c) => !c)}
            collapseControl={wideDesktop}
          />
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <MobileDrawerPresence className="fixed inset-0 z-40 md:hidden">
              <motion.div
                className="absolute inset-0"
                initial={motionEnabled ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={motionEnabled ? { opacity: 0 } : undefined}
                transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
              >
                <ModalBackdrop onClick={() => setMobileOpen(false)} />
              </motion.div>
              <motion.div
                ref={mobileDrawerRef}
                className="absolute inset-y-0 left-0"
                initial={motionEnabled ? { x: -280 } : false}
                animate={{ x: 0 }}
                exit={motionEnabled ? { x: -280 } : undefined}
                transition={scaledSpring(m, 260, 30)}
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
                  className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
                >
                  <CloseIcon width={18} height={18} />
                </button>
                <Sidebar
                  collapsed={false}
                  onToggleCollapsed={() => setMobileOpen(false)}
                  toggleLabel="Close navigation"
                  drawer
                />
              </motion.div>
            </MobileDrawerPresence>
          )}
        </AnimatePresence>

        <div
          ref={appContentRef}
          aria-hidden={mobileOpen || undefined}
          className="flex min-w-0 flex-1 flex-col"
          style={{ touchAction: 'pan-y' }}
          {...mobileNavigationSwipe}
        >
          {/* Mobile top bar */}
          <div className="flex items-center gap-2 bg-paper pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:hidden">
            <button
              ref={mobileTriggerRef}
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5 active:bg-ink/10"
            >
              <span className="flex flex-col gap-1">
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
              </span>
            </button>
            <span className="flex items-center gap-2 font-brand text-lg font-medium leading-none tracking-tight">
              <LacunaIcon
                data-testid="mobile-brand-mark"
                aria-hidden="true"
                className="h-[18px] w-[18px] shrink-0 text-accent-ink"
              />
              <span>Lacuna</span>
            </span>
          </div>

          <main
            ref={mainRef}
            id="main-content"
            // Bottom padding clears the mobile navigation bar, which is fixed and would
            // otherwise cover the last of the page's content.
            className={cn(
              // A stable gutter on every page keeps centred content from shifting between
              // pages that scroll and pages that do not.
              'min-w-0 flex-1 overflow-y-auto overscroll-y-none outline-none [scrollbar-gutter:stable]',
              'pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:pl-0',
              inCourse && 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0',
            )}
            style={{ touchAction: 'pan-y' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <ErrorBoundary label="this page">
              <StudySheetProvider value={studySheet.value}>
                <RouteTransitions
                  pathname={location.pathname}
                  direction={sectionDirection}
                  multiplier={m}
                >
                  {outlet}
                </RouteTransitions>
              </StudySheetProvider>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <div ref={bottomNavRef}>
        <CourseSectionBar />
        <AnimatePresence>
          {studySheet.open && studySheet.anchor && (
            <OverlayLoadBoundary label="Study options" onClose={studySheet.close}>
              <Suspense fallback={null}>
                <StudySheet
                  anchor={studySheet.anchor}
                  courseId={studySheet.courseId}
                  otherWays={studySheet.otherWays}
                  onClose={studySheet.close}
                />
              </Suspense>
            </OverlayLoadBoundary>
          )}
        </AnimatePresence>
      </div>
      {paletteOpen && (
        <OverlayLoadBoundary label="Quick search" onClose={() => setPaletteOpen(false)}>
          <Suspense fallback={null}>
            <CommandPalette
              open={paletteOpen}
              onClose={() => setPaletteOpen(false)}
              returnFocusTarget={paletteReturnFocusRef}
            />
          </Suspense>
        </OverlayLoadBoundary>
      )}
      <FinalExamLifecycleController />
      {hintsLoaded && (
        <OverlayLoadBoundary
          label="Keyboard shortcuts"
          open={hintsOpen}
          onClose={() => setHintsOpen(false)}
        >
          <Suspense fallback={null}>
            <KeyHints open={hintsOpen} onClose={() => setHintsOpen(false)} />
          </Suspense>
        </OverlayLoadBoundary>
      )}
    </motion.div>
  );
}

function MobileDrawerPresence(props: ComponentProps<typeof motion.div>) {
  const present = useIsPresent();
  return <motion.div {...props} inert={!present} aria-hidden={!present || undefined} />;
}
