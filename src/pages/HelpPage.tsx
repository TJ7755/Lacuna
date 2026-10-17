import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { AppLink as Link } from '../components/ui/AppLink';
import { ChartIcon, SettingsIcon, SparklesIcon } from '../components/ui/icons';
import { SettingsDisclosure } from './settings/SettingsDisclosure';
import { SettingsHeadingLevelProvider } from './settings/SettingsSectionHeading';
import { SettingsArrivalProvider } from './settings/SettingsUi';
import { BasicsCard, ShortcutsCard, StudyingCard } from './help/HelpOverview';
import {
  ContentTopics,
  CourseTopics,
  ProgressTopics,
  TipsTopics,
} from './help/HelpReferenceTopics';
import { ShortcutTopics, StudyingTopics } from './help/HelpStudyTopics';

// Each row opens for its own id or any topic it contains, so existing topic links keep working.
const NO_ANCHORS: readonly string[] = [];
const STUDYING_ANCHORS = ['study-modes', 'filtered-modes', 'how-to-study'];
const SHORTCUT_ANCHORS = ['keyboard-shortcuts', 'touch-gestures'];
const CONTENT_ANCHORS = ['card-types', 'questions', 'sequences', 'occlusions'];

const FOOTER_LINK_CLASS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface-raised px-3 text-sm font-semibold text-ink transition-colors hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink';

export function HelpPage() {
  return (
    <div className={`${PAGE_FRAME} pb-12`}>
      <header className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Help</h1>
      </header>
      <SettingsArrivalProvider>
        <div className="grid items-stretch gap-5 min-[1100px]:grid-cols-[1.15fr_1fr] [&>section]:mb-0 [&>section]:min-w-0 min-[1100px]:[&>section:first-child]:row-span-2">
          <BasicsCard />
          <StudyingCard />
          <ShortcutsCard />
        </div>
        <div className="mt-7 divide-y divide-ink/10">
          {/* Single-topic rows hold one untitled card, so its entries sit directly below the row. */}
          <SettingsDisclosure
            id="course-model"
            title="Courses & lessons"
            summary="Paths, lessons, cards and course settings"
            anchors={NO_ANCHORS}
          >
            <SettingsHeadingLevelProvider level={2}>
              <CourseTopics />
            </SettingsHeadingLevelProvider>
          </SettingsDisclosure>
          <SettingsDisclosure
            id="help-group-studying"
            title="Studying"
            summary="Study modes, filters and grading"
            anchors={STUDYING_ANCHORS}
          >
            <StudyingTopics />
          </SettingsDisclosure>
          <SettingsDisclosure
            id="help-group-shortcuts"
            title="Shortcuts & gestures"
            summary="Every key and swipe"
            anchors={SHORTCUT_ANCHORS}
          >
            <ShortcutTopics />
          </SettingsDisclosure>
          <SettingsDisclosure
            id="progress"
            title="Progress & scheduling"
            summary="The progress bar and FSRS"
            anchors={NO_ANCHORS}
          >
            <SettingsHeadingLevelProvider level={2}>
              <ProgressTopics />
            </SettingsHeadingLevelProvider>
          </SettingsDisclosure>
          <SettingsDisclosure
            id="help-group-content"
            title="Cards & content"
            summary="Card types, questions, sequences and diagrams"
            anchors={CONTENT_ANCHORS}
          >
            <ContentTopics />
          </SettingsDisclosure>
          <SettingsDisclosure
            id="tips"
            title="Tips & best practice"
            summary="Getting the most from Lacuna"
            anchors={NO_ANCHORS}
          >
            <SettingsHeadingLevelProvider level={2}>
              <TipsTopics />
            </SettingsHeadingLevelProvider>
          </SettingsDisclosure>
        </div>
      </SettingsArrivalProvider>

      <div className="mt-4 border-t border-line py-10 text-left">
        <div className="flex flex-wrap gap-2">
          <Link to="/settings" className={FOOTER_LINK_CLASS}>
            <SettingsIcon width={16} height={16} />
            Settings
          </Link>
          <Link to="/analytics" className={FOOTER_LINK_CLASS}>
            <ChartIcon width={16} height={16} />
            Progress
          </Link>
          <Link to="/method" className={FOOTER_LINK_CLASS}>
            <SparklesIcon width={16} height={16} />
            How the scheduler works
          </Link>
        </div>
      </div>
    </div>
  );
}
