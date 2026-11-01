import { useEffect, useState } from 'react';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import { useLocation } from 'react-router-dom';
import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { AppLink as Link } from '../components/ui/AppLink';
import {
  CardsIcon,
  ChartIcon,
  PlayIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
} from '../components/ui/icons';
import { HELP_ALIASES, HELP_GROUPS, helpTopics } from './help/helpTopics';
import { searchHelp } from './help/searchHelp';
import { HELP_LINK_CLASS, HelpTopicRow } from './help/HelpTopicRow';
import {
  SettingsArrivalProvider,
  SettingsCard,
  SETTINGS_HEADING_ROW_CLASS,
} from './settings/SettingsUi';
import { SettingsSectionHeading } from './settings/SettingsSectionHeading';
import { FeedbackSection } from '../components/feedback/FeedbackSection';

const GROUP_ICONS = [SparklesIcon, PlayIcon, CardsIcon, ChartIcon, SettingsIcon];
const GROUP_COLUMNS = [HELP_GROUPS.slice(0, 2), HELP_GROUPS.slice(2)];

function fragment() {
  try {
    return decodeURIComponent(window.location.hash.split('#').at(-1) ?? '');
  } catch {
    return '';
  }
}

export function HelpPage() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [target, setTarget] = useState<string | null>(null);
  const location = useLocation();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const searching = query.trim() !== '';
  const topics = searchHelp(query);

  useEffect(() => {
    function reveal() {
      // HashRouter navigation uses pushState; native fragment changes still need a listener.
      const hash = fragment();
      const id = HELP_ALIASES[hash] ?? hash;
      if (!helpTopics.some((topic) => topic.id === id)) return;
      setQuery('');
      setExpanded((previous) => new Set([...previous, id]));
      setTarget(id);
    }
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [location.key]);

  useEffect(() => {
    if (!target) return;
    document.getElementById(target)?.scrollIntoView({ block: 'start' });
    if (multiplier === 0) setTarget(null);
  }, [target, multiplier, location.key]);

  function row(topic: (typeof helpTopics)[number]) {
    return (
      <HelpTopicRow
        key={topic.id}
        topic={topic}
        open={searching || expanded.has(topic.id)}
        onRevealed={() => {
          if (target !== topic.id) return;
          document.getElementById(target)?.scrollIntoView({ block: 'start' });
          setTarget(null);
        }}
        onToggle={() => {
          if (searching) return;
          setTarget(null);
          setExpanded((previous) => {
            const next = new Set(previous);
            if (next.has(topic.id)) next.delete(topic.id);
            else next.add(topic.id);
            return next;
          });
        }}
      />
    );
  }

  return (
    <div className={`${PAGE_FRAME} pb-12`}>
      <header className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Help</h1>
      </header>
      <label className="relative mb-7 block min-[1100px]:max-w-[calc((100%-1.25rem)/2)]">
        <SearchIcon
          width={18}
          height={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="search"
          aria-label="Search help"
          placeholder="Search help"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 w-full rounded-full bg-surface pl-11 pr-4 text-ink card-surface card-surface-control outline-none placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent-ink"
        />
      </label>
      <SettingsArrivalProvider>
        {searching ? (
          <SettingsCard className="mb-0! min-w-0">
            <div className={`${SETTINGS_HEADING_ROW_CLASS} mb-2`}>
              <SearchIcon width={18} height={18} className="shrink-0" />
              <SettingsSectionHeading
                level={2}
                className="font-display text-xl font-semibold tracking-tight"
              >
                Results
              </SettingsSectionHeading>
            </div>
            {topics.length ? (
              topics.map(row)
            ) : (
              <p role="status" className="py-6 pl-[calc(18px+0.625rem)] text-sm text-ink-soft">
                No matching topics.
              </p>
            )}
          </SettingsCard>
        ) : (
          <div className="grid items-start gap-5 min-[1100px]:grid-cols-2">
            {GROUP_COLUMNS.map((groups, index) => (
              <div key={index} className="flex min-w-0 flex-col gap-5">
                {groups.map((group) => {
                  const Icon = GROUP_ICONS[HELP_GROUPS.indexOf(group)];
                  return (
                    <SettingsCard key={group} className="mb-0! min-w-0">
                      <div className={`${SETTINGS_HEADING_ROW_CLASS} mb-2`}>
                        <Icon width={18} height={18} className="shrink-0" />
                        <SettingsSectionHeading
                          level={2}
                          className="font-display text-xl font-semibold tracking-tight"
                        >
                          {group}
                        </SettingsSectionHeading>
                      </div>
                      {topics.filter((topic) => topic.group === group).map(row)}
                    </SettingsCard>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </SettingsArrivalProvider>

      <FeedbackSection />

      <div className="mt-4 border-t border-line py-10 text-left">
        <div className="flex flex-wrap gap-2">
          <Link to="/settings" className={HELP_LINK_CLASS}>
            <SettingsIcon width={16} height={16} />
            Settings
          </Link>
          <Link to="/analytics" className={HELP_LINK_CLASS}>
            <ChartIcon width={16} height={16} />
            Progress
          </Link>
          <Link to="/method" className={HELP_LINK_CLASS}>
            <SparklesIcon width={16} height={16} />
            How the scheduler works
          </Link>
        </div>
      </div>
    </div>
  );
}
