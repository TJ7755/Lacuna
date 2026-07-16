import { useEffect, useRef, useState } from 'react';
import { LayoutGroup, m as motion, useMotionValue, useSpring } from 'motion/react';
import { cn } from '../components/ui/cn';
import { useIsTouchMode } from '../state/inputMode';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import { AppearanceSection } from './settings/AppearanceSection';
import { BackupsSection } from './settings/BackupsSection';
import { DashboardSection } from './settings/DashboardSection';
import { DataPortabilitySection } from './settings/DataPortabilitySection';
import { InputModeSection } from './settings/InputModeSection';
import { InstallSection } from './settings/InstallSection';
import { McpSection } from './settings/McpSection';
import { PomodoroSection } from './settings/PomodoroSection';
import { ShortcutsSection } from './settings/ShortcutsSection';
import { SidebarSection } from './settings/SidebarSection';
import { StudySection } from './settings/StudySection';

const SETTINGS_SECTIONS = [
  { id: 'settings-appearance', label: 'Appearance' },
  { id: 'settings-input', label: 'Input mode' },
  { id: 'settings-sidebar', label: 'Sidebar' },
  { id: 'settings-dashboard', label: 'Dashboard' },
  { id: 'settings-study', label: 'Study & scheduling' },
  { id: 'settings-shortcuts', label: 'Keyboard shortcuts' },
  { id: 'settings-pomodoro', label: 'Pomodoro timer' },
  { id: 'settings-install', label: 'Install' },
  ...(typeof window !== 'undefined' && window.electronAPI?.isElectron
    ? [{ id: 'settings-mcp', label: 'MCP server' }]
    : []),
  { id: 'settings-export', label: 'Import & export' },
  { id: 'settings-backups', label: 'Automatic backups' },
];

export function Settings() {
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const [activeSection, setActiveSection] = useState(SETTINGS_SECTIONS[0].id);

  useEffect(() => {
    const intersecting = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) intersecting.add(entry.target.id);
          else intersecting.delete(entry.target.id);
        });
        const top = SETTINGS_SECTIONS.find((section) => intersecting.has(section.id));
        if (top) setActiveSection(top.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    SETTINGS_SECTIONS.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-6 pb-10 pt-12 md:px-10 md:py-10">
      <div className="min-w-0 flex-1 max-w-2xl">
        <header className="relative mb-10 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8">
          <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
          <div className="relative">
            <p className="mb-1 text-sm uppercase tracking-[0.18em] text-ink-faint">Preferences</p>
            <h1 className="font-display text-4xl tracking-tight md:text-5xl">Settings</h1>
          </div>
        </header>

        <AppearanceSection motionMultiplier={motionMultiplier} />
        <InputModeSection motionMultiplier={motionMultiplier} />
        <SidebarSection motionMultiplier={motionMultiplier} />
        <DashboardSection motionMultiplier={motionMultiplier} />
        <StudySection motionMultiplier={motionMultiplier} />
        <ShortcutsSection motionMultiplier={motionMultiplier} />
        <PomodoroSection motionMultiplier={motionMultiplier} />
        <InstallSection motionMultiplier={motionMultiplier} />
        {window.electronAPI?.isElectron && <McpSection motionMultiplier={motionMultiplier} />}
        <DataPortabilitySection motionMultiplier={motionMultiplier} />
        <BackupsSection motionMultiplier={motionMultiplier} />
      </div>

      <aside className="hidden xl:block w-64 shrink-0">
        <div className="sticky top-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-xl shadow-black/5 backdrop-blur-sm"
          >
            {motionMultiplier > 0 && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 3 * motionMultiplier, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            {motionMultiplier > 0 && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={{ background: 'radial-gradient(circle at 50% 0%, hsl(var(--accent) / 0.06), transparent 55%)' }}
                animate={{ opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 5 * motionMultiplier, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <div className="relative mb-3 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-ink-faint">On this page</div>
            <LayoutGroup>
              <nav className="relative flex flex-col gap-1">
                {SETTINGS_SECTIONS.map((section, index) => (
                  <NavItem
                    key={section.id}
                    section={section}
                    active={activeSection === section.id}
                    onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    index={index}
                    motionMultiplier={motionMultiplier}
                  />
                ))}
              </nav>
            </LayoutGroup>
          </motion.div>
        </div>
      </aside>
    </div>
  );
}

function NavItem({ section, active, onClick, index, motionMultiplier }: {
  section: (typeof SETTINGS_SECTIONS)[number];
  active: boolean;
  onClick: () => void;
  index: number;
  motionMultiplier: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
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
      onMouseMove={(event) => {
        if (!cursorFollowEnabled || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        mouseX.set((event.clientX - (rect.left + rect.width / 2)) * 0.12);
        mouseY.set((event.clientY - (rect.top + rect.height / 2)) * 0.12);
      }}
      onMouseLeave={() => {
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
          {motionMultiplier > 0 && (
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-lg bg-gradient-to-r from-accent/10 via-accent/5 to-transparent"
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 2.5 * motionMultiplier, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </motion.div>
      )}
      <span className="relative z-10 truncate font-medium">{section.label}</span>
    </motion.button>
  );
}
