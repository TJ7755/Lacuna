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

import { useCallback, useEffect, useState } from 'react';
import { LayoutGroup, m as motion } from 'motion/react';
import { cn } from './cn';
import { ChevronDownIcon } from './icons';
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

function scrollToSection(id: string, motionMultiplier: number) {
  document.getElementById(id)?.scrollIntoView({
    behavior: motionMultiplier > 0 ? 'smooth' : 'instant',
    block: 'start',
  });
}

/**
 * Tracks which section is currently in view via IntersectionObserver and
 * returns the active section id plus a navigate helper. Shared by both the
 * desktop rail and the mobile jumper so they stay in sync off one observer.
 */
export function useSectionRail(sections: SectionRailItem[], motionMultiplier = 1, ready = true) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? '');
  const sectionIds = sections.map((section) => section.id).join('|');

  useEffect(() => {
    if (!ready) return;
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
  }, [sectionIds, ready]);

  const goToSection = useCallback(
    (id: string) => scrollToSection(id, motionMultiplier),
    [motionMultiplier],
  );

  return { activeSection, goToSection };
}

interface SectionRailProps {
  sections: SectionRailItem[];
  activeSection: string;
  onNavigate: (id: string) => void;
  motionMultiplier: number;
  compact?: boolean;
}

/** Shared section navigation; compact keeps the same controls available below xl. */
export function SectionRail({
  sections,
  activeSection,
  onNavigate,
  motionMultiplier,
  compact = false,
}: SectionRailProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  if (!isDesktop && !compact) return null;

  return (
    <aside
      aria-label="Page sections"
      className={compact ? 'w-full shrink-0 xl:w-[200px]' : 'w-[200px] shrink-0'}
    >
      <div className="sticky top-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <LayoutGroup>
            <nav className="relative flex flex-col gap-0.5">
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

function NavItem({
  section,
  active,
  onClick,
  index,
  motionMultiplier,
}: {
  section: SectionRailItem;
  active: boolean;
  onClick: () => void;
  index: number;
  motionMultiplier: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      initial={motionMultiplier > 0 ? { opacity: 0, x: -8 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 * index * motionMultiplier, duration: 0.35 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      data-press=""
      whileTap={{ scale: 0.98 }}
      className={cn(
        'relative flex min-h-11 items-center rounded-xl px-3.5 text-left text-[15px] transition-colors duration-150',
        active ? 'font-bold text-ink' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
      )}
    >
      {active && (
        <motion.div
          layoutId="activePill"
          className="absolute inset-0 rounded-xl bg-surface shadow-[0_1px_2px_hsl(var(--ink)/0.06)]"
          transition={
            motionMultiplier > 0
              ? { type: 'spring', stiffness: 500, damping: 38 }
              : { duration: 0 }
          }
        />
      )}
      <span className="relative z-10 truncate">{section.label}</span>
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
export function SectionRailMobileJumper({
  sections,
  activeSection,
  onNavigate,
  label = 'Jump to section',
  className,
}: SectionRailMobileJumperProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  if (isDesktop) return null;

  return (
    <div
      className={cn(
        'sticky top-0 z-10 mb-6 rounded-xl border border-line bg-surface p-2 shadow-sm',
        className,
      )}
    >
      <label className="relative flex items-center">
        <span className="sr-only">{label}</span>
        <select
          value={activeSection}
          onChange={(event) => onNavigate(event.target.value)}
          className="w-full appearance-none rounded-lg bg-transparent py-1.5 pl-2 pr-8 text-sm font-medium text-ink outline-none"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          className="pointer-events-none absolute right-2 text-ink-faint"
          width={16}
          height={16}
        />
      </label>
    </div>
  );
}
