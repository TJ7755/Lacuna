// Shared scrollspy section rail. Extracted from Settings.tsx (Arc 10 task 4)
// so CourseSettings can adopt the same "on this page" wayfinding rather than
// duplicating it. At xl+ this renders the original sticky sidebar nav with
// IntersectionObserver-driven active-section highlighting, unchanged in
// behaviour. Below xl — where the sidebar has always been hidden — a compact
// sticky jumper takes over so wayfinding no longer disappears on mobile and
// tablet. SectionRail and SectionRailMobileJumper each gate their own render
// on the same `useMediaQuery` breakpoint (see DESKTOP_QUERY below), so only
// one of the two ever mounts at a time — not two independently-styled,
// always-mounted elements hidden via separate Tailwind breakpoint classes.

import { useEffect, useRef, useState } from 'react';
import { LayoutGroup, m as motion, useMotionValue, useSpring } from 'motion/react';
import { cn } from './cn';
import { ChevronDownIcon } from './icons';
import { useIsTouchMode } from '../../state/inputMode';
import { useMediaQuery } from '../../hooks/useMediaQuery';

// Matches Tailwind's default `xl` breakpoint. Both SectionRail and
// SectionRailMobileJumper gate their render on this single matchMedia query
// so the desktop rail and mobile jumper are architecturally guaranteed
// mutually exclusive, rather than relying on two independent `hidden xl:block`
// / `xl:hidden` utility classes that could in principle drift out of sync.
const DESKTOP_QUERY = '(min-width: 1280px)';

export interface SectionRailItem {
  id: string;
  label: string;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Tracks which section is currently in view via IntersectionObserver and
 * returns the active section id plus a navigate helper. Shared by both the
 * desktop rail and the mobile jumper so they stay in sync off one observer.
 */
export function useSectionRail(sections: SectionRailItem[]) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? '');
  const sectionIds = sections.map((section) => section.id).join('|');

  useEffect(() => {
    const intersecting = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) intersecting.add(entry.target.id);
          else intersecting.delete(entry.target.id);
        });
        const top = sections.find((section) => intersecting.has(section.id));
        if (top) setActiveSection(top.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIds]);

  return { activeSection, goToSection: scrollToSection };
}

interface SectionRailProps {
  sections: SectionRailItem[];
  activeSection: string;
  onNavigate: (id: string) => void;
  motionMultiplier: number;
  title?: string;
}

/** Sticky desktop sidebar nav, rendered only from the `xl` breakpoint up. */
export function SectionRail({ sections, activeSection, onNavigate, motionMultiplier, title = 'On this page' }: SectionRailProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  if (!isDesktop) return null;

  return (
    <aside className="w-64 shrink-0">
      <div className="sticky top-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-xl shadow-black/5"
        >
          <div className="relative mb-3 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-ink-faint">{title}</div>
          <LayoutGroup>
            <nav className="relative flex flex-col gap-1">
              {sections.map((section, index) => (
                <NavItem
                  key={section.id}
                  section={section}
                  active={activeSection === section.id}
                  onClick={() => onNavigate(section.id)}
                  index={index}
                  motionMultiplier={motionMultiplier}
                />
              ))}
            </nav>
          </LayoutGroup>
        </motion.div>
      </div>
    </aside>
  );
}

function NavItem({ section, active, onClick, index, motionMultiplier }: {
  section: SectionRailItem;
  active: boolean;
  onClick: () => void;
  index: number;
  motionMultiplier: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const bounds = useRef<DOMRect | null>(null);
  const isTouchMode = useIsTouchMode();
  const cursorFollowEnabled = motionMultiplier > 0 && !isTouchMode;
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 350, damping: 25 });
  const springY = useSpring(mouseY, { stiffness: 350, damping: 25 });

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseEnter={() => {
        if (cursorFollowEnabled && ref.current) bounds.current = ref.current.getBoundingClientRect();
      }}
      onMouseMove={(event) => {
        const rect = bounds.current;
        if (!cursorFollowEnabled || !rect) return;
        mouseX.set((event.clientX - (rect.left + rect.width / 2)) * 0.12);
        mouseY.set((event.clientY - (rect.top + rect.height / 2)) * 0.12);
      }}
      onMouseLeave={() => {
        bounds.current = null;
        mouseX.set(0);
        mouseY.set(0);
      }}
      style={{ x: cursorFollowEnabled ? springX : 0, y: cursorFollowEnabled ? springY : 0 }}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 * index * motionMultiplier, duration: 0.35 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'relative flex items-center rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150',
        active ? 'text-accent' : 'text-ink-soft hover:text-ink',
      )}
    >
      {active && (
        <motion.div layoutId="activePill" className="absolute inset-0 rounded-lg bg-accent/10" transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
          <motion.div layoutId="activeBar" className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-accent" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
        </motion.div>
      )}
      <span className="relative z-10 truncate font-medium">{section.label}</span>
    </motion.button>
  );
}

interface SectionRailMobileJumperProps {
  sections: SectionRailItem[];
  activeSection: string;
  onNavigate: (id: string) => void;
  label?: string;
  className?: string;
}

/**
 * Compact sticky section jumper for viewports below `xl`, where the sidebar
 * rail has no room. A native select keeps it accessible and touch-friendly
 * without inventing new interaction patterns.
 */
export function SectionRailMobileJumper({ sections, activeSection, onNavigate, label = 'Jump to section', className }: SectionRailMobileJumperProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  if (isDesktop) return null;

  return (
    <div className={cn('sticky top-0 z-10 mb-6 rounded-xl border border-line bg-surface p-2 shadow-sm', className)}>
      <label className="relative flex items-center">
        <span className="sr-only">{label}</span>
        <select
          value={activeSection}
          onChange={(event) => onNavigate(event.target.value)}
          className="w-full appearance-none rounded-lg bg-transparent py-1.5 pl-2 pr-8 text-sm font-medium text-ink outline-none"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>{section.label}</option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-2 text-ink-faint" width={16} height={16} />
      </label>
    </div>
  );
}
