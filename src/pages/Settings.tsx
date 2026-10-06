import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { useEffect, type ReactNode } from 'react';
import { SectionRail, SectionRailMobileJumper, useSectionRail } from '../components/ui/SectionRail';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import { AppearanceSection } from './settings/AppearanceSection';
import { BackupsSection } from './settings/BackupsSection';
import { DashboardSection } from './settings/DashboardSection';
import { DataLinksSection } from './settings/DataLinksSection';
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
import { SettingsArrivalProvider } from './settings/SettingsUi';

declare const __APP_VERSION__: string;

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
}

const SETTINGS_SECTIONS = [
  { id: 'settings-group-appearance', label: 'Appearance & access' },
  { id: 'settings-group-study', label: 'Study behaviour' },
  { id: 'settings-group-course-defaults', label: 'Course defaults' },
  { id: 'settings-group-data', label: 'Your data' },
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
  'settings-data-links',
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
    <div className={`${PAGE_FRAME} pb-12 pt-4 md:pt-2`}>
      <header className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Settings</h1>
        <p className="text-sm tabular text-ink-faint">Version {appVersion()}</p>
      </header>
      <div className="flex flex-row-reverse gap-8">
        <div className="min-w-0 flex-1">
          <SettingsArrivalProvider>
            <SectionRailMobileJumper
              sections={SETTINGS_SECTIONS}
              activeSection={activeSection}
              onNavigate={goToSection}
              label="Jump to settings group"
            />

            <SettingsGroup id="settings-group-appearance" title="Appearance & access">
              <AppearanceSection />
              <InputModeSection />
              <SidebarSection />
              <DashboardSection />
              <CourseHeaderSection />
              <ShortcutsSection />
            </SettingsGroup>

            <SettingsGroup id="settings-group-study" title="Study behaviour">
              <StudySection />
              <PomodoroSection />
            </SettingsGroup>

            <SettingsGroup id="settings-group-course-defaults" title="Course defaults">
              <CourseDefaultsSection />
            </SettingsGroup>

            <SettingsGroup id="settings-group-data" title="Your data">
              <BackupsSection />
              <DataLinksSection />
              <SyncSection />
              <DataPortabilitySection motionMultiplier={motionMultiplier} />
            </SettingsGroup>

            <SettingsGroup id="settings-group-integrations" title="Integrations">
              <InstallSection />
              <AiSection />
              {window.electronAPI?.isElectron && <McpSection />}
            </SettingsGroup>
          </SettingsArrivalProvider>
        </div>

        <SectionRail
          sections={SETTINGS_SECTIONS}
          activeSection={activeSection}
          onNavigate={goToSection}
          motionMultiplier={motionMultiplier}
        />
      </div>
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
      {/* The section rail already names the group on screen; the heading keeps
          the outline for assistive technology. */}
      <h2 id={headingId} className="sr-only">
        {title}
      </h2>
      <SettingsHeadingLevelProvider level={3}>{children}</SettingsHeadingLevelProvider>
    </section>
  );
}
