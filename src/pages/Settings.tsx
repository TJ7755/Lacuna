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

declare const __APP_VERSION__: string;

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
}

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
    <div className="mx-auto flex max-w-6xl gap-6 px-6 pb-10 pt-12 md:px-10 md:py-10">
      <div className="min-w-0 flex-1">
        <header className="mb-12 flex items-baseline justify-between gap-4 pt-2 md:pt-4">
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">Settings</h1>
          <p className="text-sm tabular text-ink-faint">Version {appVersion()}</p>
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
        >
          <StudySection />
          <PomodoroSection />
        </SettingsGroup>

        <SettingsGroup
          id="settings-group-course-defaults"
          title="Course defaults"
        >
          <CourseDefaultsSection />
        </SettingsGroup>

        <SettingsGroup
          id="settings-group-data"
          title="Data safety"
        >
          <SyncSection />
          <DataPortabilitySection motionMultiplier={motionMultiplier} />
          <BackupsSection />
        </SettingsGroup>

        <SettingsGroup
          id="settings-group-integrations"
          title="Integrations"
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
      />
    </div>
  );
}

function SettingsGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="mb-8 scroll-mt-20 first:mt-0 [&>section]:scroll-mt-20"
    >
      <div className="mb-5 border-b border-line pb-4">
        <h2 id={headingId} className="font-display text-2xl tracking-tight">
          {title}
        </h2>
      </div>
      <SettingsHeadingLevelProvider level={3}>{children}</SettingsHeadingLevelProvider>
    </section>
  );
}
