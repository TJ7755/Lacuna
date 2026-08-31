import { useEffect, type ReactNode } from 'react';
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
import { CourseDefaultsSection, StudySection } from './settings/StudySection';
import { SyncSection } from './settings/SyncSection';
import { AiSection } from './settings/AiSection';
import { SettingsHeadingLevelProvider } from './settings/SettingsSectionHeading';

const SETTINGS_SECTIONS = [
  { id: 'settings-group-appearance', label: 'Appearance & access' },
  { id: 'settings-group-study', label: 'Study behaviour' },
  { id: 'settings-group-course-defaults', label: 'Course defaults' },
  { id: 'settings-group-data', label: 'Data safety' },
  { id: 'settings-group-integrations', label: 'Integrations' },
];

const SETTINGS_ANCHOR_IDS = new Set([
  ...SETTINGS_SECTIONS.map((section) => section.id),
  'settings-appearance',
  'settings-input',
  'settings-sidebar',
  'settings-dashboard',
  'settings-course-header',
  'settings-study',
  'settings-shortcuts',
  'settings-pomodoro',
  'settings-course-defaults',
  'settings-install',
  'settings-sync',
  'settings-ai',
  'settings-mcp',
  'settings-export',
  'settings-backups',
]);

function settingsAnchorId(hash: string): string | null {
  const fragment = hash.slice(hash.lastIndexOf('#') + 1);
  if (!fragment || fragment.startsWith('/')) return null;
  try {
    const id = decodeURIComponent(fragment);
    return SETTINGS_ANCHOR_IDS.has(id) ? id : null;
  } catch {
    return null;
  }
}

export function Settings() {
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const { activeSection, goToSection } = useSectionRail(SETTINGS_SECTIONS, motionMultiplier);

  useEffect(() => {
    function scrollToDeepLink() {
      const id = settingsAnchorId(window.location.hash);
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }

    scrollToDeepLink();
    window.addEventListener('hashchange', scrollToDeepLink);
    return () => window.removeEventListener('hashchange', scrollToDeepLink);
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

        <SectionRailMobileJumper
          sections={SETTINGS_SECTIONS}
          activeSection={activeSection}
          onNavigate={goToSection}
          label="Jump to settings group"
        />

        <SettingsGroup
          id="settings-group-appearance"
          title="Appearance & access"
          description="Make Lacuna comfortable to read, navigate and control on this device."
        >
          <AppearanceSection />
          <InputModeSection />
          <SidebarSection />
          <DashboardSection />
          <CourseHeaderSection />
          <ShortcutsSection />
        </SettingsGroup>

        <SettingsGroup
          id="settings-group-study"
          title="Study behaviour"
          description="Choose how study sessions, answers and focus time work."
        >
          <StudySection />
          <PomodoroSection />
        </SettingsGroup>

        <SettingsGroup
          id="settings-group-course-defaults"
          title="Course defaults"
          description="Set shared course behaviour that an individual course can override."
        >
          <CourseDefaultsSection />
        </SettingsGroup>

        <SettingsGroup
          id="settings-group-data"
          title="Data safety"
          description="Keep local study data recoverable and consistent across your devices."
        >
          <SyncSection />
          <DataPortabilitySection motionMultiplier={motionMultiplier} />
          <BackupsSection />
        </SettingsGroup>

        <SettingsGroup
          id="settings-group-integrations"
          title="Integrations"
          description="Install Lacuna and control the external tools allowed to connect to it."
        >
          <InstallSection />
          <AiSection />
          {window.electronAPI?.isElectron && <McpSection />}
        </SettingsGroup>
      </div>

      <SectionRail
        sections={SETTINGS_SECTIONS}
        activeSection={activeSection}
        onNavigate={goToSection}
        motionMultiplier={motionMultiplier}
        title="Settings groups"
      />
    </div>
  );
}

function SettingsGroup({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-20 first:mt-0 [&>section]:scroll-mt-20"
    >
      <div className="mb-5 border-b border-line pb-4">
        <h2 id={headingId} className="font-display text-2xl tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      </div>
      <SettingsHeadingLevelProvider level={3}>{children}</SettingsHeadingLevelProvider>
    </section>
  );
}
