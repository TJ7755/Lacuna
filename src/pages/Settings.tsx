import { SectionRail, SectionRailMobileJumper, useSectionRail } from '../components/ui/SectionRail';
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
import { CourseHeaderSection } from './settings/CourseHeaderSection';
import { StudySection } from './settings/StudySection';
import { SyncSection } from './settings/SyncSection';
import { AiSection } from './settings/AiSection';

const SETTINGS_SECTIONS = [
  { id: 'settings-appearance', label: 'Appearance' },
  { id: 'settings-input', label: 'Input mode' },
  { id: 'settings-sidebar', label: 'Sidebar' },
  { id: 'settings-dashboard', label: 'Dashboard' },
  { id: 'settings-study', label: 'Study & scheduling' },
  { id: 'settings-shortcuts', label: 'Keyboard shortcuts' },
  { id: 'settings-pomodoro', label: 'Pomodoro timer' },
  { id: 'settings-install', label: 'Install' },
  { id: 'settings-sync', label: 'Device sync' },
  { id: 'settings-ai', label: 'AI' },
  ...(typeof window !== 'undefined' && window.electronAPI?.isElectron
    ? [{ id: 'settings-mcp', label: 'MCP server' }]
    : []),
  { id: 'settings-export', label: 'Full backup & recovery' },
  { id: 'settings-backups', label: 'Automatic backups' },
];

export function Settings() {
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const { activeSection, goToSection } = useSectionRail(SETTINGS_SECTIONS);

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

        <SectionRailMobileJumper
          sections={SETTINGS_SECTIONS}
          activeSection={activeSection}
          onNavigate={goToSection}
        />

        <AppearanceSection />
        <InputModeSection />
        <SidebarSection />
        <CourseHeaderSection />
        <DashboardSection />
        <StudySection />
        <ShortcutsSection />
        <PomodoroSection />
        <InstallSection />
        <SyncSection />
        <AiSection />
        {window.electronAPI?.isElectron && <McpSection />}
        <DataPortabilitySection motionMultiplier={motionMultiplier} />
        <BackupsSection />
      </div>

      <SectionRail
        sections={SETTINGS_SECTIONS}
        activeSection={activeSection}
        onNavigate={goToSection}
        motionMultiplier={motionMultiplier}
      />
    </div>
  );
}
