import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { useSectionDeepLink } from '../hooks/useSectionDeepLink';
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
import { SettingsDisclosure } from './settings/SettingsDisclosure';
import { SettingsArrivalProvider } from './settings/SettingsUi';

declare const __APP_VERSION__: string;

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
}

const APPEARANCE_ANCHORS = [
  'settings-sidebar',
  'settings-dashboard',
  'settings-course-header',
  'settings-shortcuts',
];
const STUDY_ANCHORS = ['settings-study'];
const DEFAULTS_ANCHORS = ['settings-course-defaults'];
const DATA_ANCHORS = [
  'settings-backups',
  'settings-data-links',
  'settings-sync',
  'settings-export',
];
const INTEGRATION_ANCHORS = ['settings-install', 'settings-ai', 'settings-mcp'];
const COMMON_ANCHORS = new Set(['settings-appearance', 'settings-input', 'settings-pomodoro']);

export function Settings() {
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);

  useSectionDeepLink(COMMON_ANCHORS);

  return (
    <div className={`${PAGE_FRAME} pb-12`}>
      <header className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Settings</h1>
        <p className="text-sm tabular text-ink-faint">Version {appVersion()}</p>
      </header>
      <SettingsArrivalProvider>
        <div className="grid items-stretch gap-5 min-[1100px]:grid-cols-[1.15fr_1fr] [&>section]:mb-0 [&>section]:min-w-0 min-[1100px]:[&>section:first-child]:row-span-2">
          <AppearanceSection />
          <InputModeSection />
          <PomodoroSection />
        </div>
        <div className="mt-7 divide-y divide-ink/10">
          <SettingsDisclosure
            id="settings-group-appearance"
            title="Appearance & access"
            summary="Sidebar, Today, course header and shortcuts"
            anchors={APPEARANCE_ANCHORS}
          >
            <SidebarSection />
            <DashboardSection />
            <CourseHeaderSection />
            <ShortcutsSection />
          </SettingsDisclosure>
          <SettingsDisclosure
            id="settings-group-study"
            title="Study behaviour"
            summary="Grading, audio and focus mode"
            anchors={STUDY_ANCHORS}
          >
            <StudySection />
          </SettingsDisclosure>
          <SettingsDisclosure
            id="settings-group-course-defaults"
            title="Course defaults"
            summary="Scheduling and practice"
            anchors={DEFAULTS_ANCHORS}
          >
            <CourseDefaultsSection />
          </SettingsDisclosure>
          <SettingsDisclosure
            id="settings-group-data"
            title="Your data"
            summary="Backups, sync and recovery"
            anchors={DATA_ANCHORS}
          >
            <BackupsSection />
            <DataLinksSection />
            <SyncSection />
            <DataPortabilitySection motionMultiplier={motionMultiplier} />
          </SettingsDisclosure>
          <SettingsDisclosure
            id="settings-group-integrations"
            title="Integrations"
            summary="Install and AI"
            anchors={INTEGRATION_ANCHORS}
          >
            <InstallSection />
            <AiSection />
            {window.electronAPI?.isElectron && <McpSection />}
          </SettingsDisclosure>
        </div>
      </SettingsArrivalProvider>
    </div>
  );
}
