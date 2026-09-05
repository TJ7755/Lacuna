import { AnimatePresence, m as motion } from 'motion/react';
import type { Card } from '../../db/types';
import { progressNoun } from '../../fsrs/objective';
import {
  ClockIcon,
  EditIcon,
  FlagIcon,
  FocusIcon,
  FullscreenIcon,
  KeyboardIcon,
  MenuIcon,
  MoreIcon,
  PauseIcon,
  RestoreIcon,
} from '../../components/ui/icons';
import { Button } from '../../components/ui/Button';
import { PomodoroTimer } from '../../components/learn/PomodoroTimer';
import { cn } from '../../components/ui/cn';
import type { CardFilter } from '../../db/search';
import { TouchMenuSheet } from './TouchMenu';
import { FILTER_LABELS } from './types';
import type { LearnModeType, SessionCardOutcome, StudyUnit } from './types';

function computeHeaderInfo({
  singleDeck,
  unitDisplayName,
  mode,
  filterParams,
  tagFilter,
  revisionNextWindowDay,
}: {
  singleDeck: StudyUnit | null;
  unitDisplayName: string | null;
  mode: LearnModeType;
  filterParams: CardFilter[];
  tagFilter: string | null;
  revisionNextWindowDay?: string;
}) {
  // unitDisplayName overrides the unit's own name for lesson scope, whose
  // scheduling unit is the parent Course rather than the lesson itself.
  const deckName = unitDisplayName ?? (singleDeck ? singleDeck.name : 'Review today · all courses');
  const tagPart = tagFilter ? `tag "${tagFilter}"` : '';

  const filterLabels = filterParams.map((f) => FILTER_LABELS[f] ?? f);
  const filterPart = filterLabels.join(', ');

  switch (mode) {
    case 'simple':
      return {
        title: 'Simple Learn',
        subtitle: tagPart,
      };
    case 'cram':
      return {
        title: `${deckName} · Revision plan`,
        subtitle: revisionNextWindowDay ? `Next ${revisionNextWindowDay}` : tagPart,
      };
    case 'filtered-due':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart,
      };
    case 'filtered-new':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart,
      };
    case 'filtered-leech':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart,
      };
    case 'filtered-flagged':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart,
      };
    case 'filtered-suspended':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart,
      };
    case 'filtered':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart,
      };
    default:
      return {
        title: deckName,
        subtitle: tagPart || '',
      };
  }
}

export function LearnHeader({
  mode,
  plannedRevision,
  revisionSecondsRemaining,
  revisionWindowBudgetSeconds,
  revisionNextWindowDay,
  singleDeck,
  unitDisplayName,
  sessionProgress,
  sessionCardIds,
  sessionCardOutcomes,
  filterParams,
  tagFilter,
  onOpenNav,
  onExit,
  focusMode,
  onToggleFocus,
  onToggleFullscreen,
  isFullscreen,
  onPointerLeave,
  menuOpen,
  setMenuOpen,
  current,
  isTouchMode,
  onEdit,
  onToggleFlag,
  onBury,
  onSuspend,
  onShowShortcuts,
  m,
  currentCardId,
}: {
  mode: LearnModeType;
  plannedRevision: boolean;
  revisionSecondsRemaining: number;
  revisionWindowBudgetSeconds: number;
  revisionNextWindowDay?: string;
  singleDeck: StudyUnit | null;
  unitDisplayName: string | null;
  sessionProgress: number;
  sessionCardIds: string[];
  sessionCardOutcomes: Map<string, SessionCardOutcome>;
  filterParams: CardFilter[];
  tagFilter: string | null;
  onOpenNav: () => void;
  onExit: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onPointerLeave: () => void;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  current: Card | null;
  isTouchMode: boolean;
  onEdit: () => void;
  onToggleFlag: () => void;
  onBury: () => void;
  onSuspend: () => void;
  onShowShortcuts: () => void;
  m: number;
  currentCardId: string | null;
}) {
  const info = computeHeaderInfo({
    singleDeck,
    unitDisplayName,
    mode,
    filterParams,
    tagFilter,
    revisionNextWindowDay,
  });
  const displayedProgress = plannedRevision
    ? revisionWindowBudgetSeconds > 0
      ? 1 - revisionSecondsRemaining / revisionWindowBudgetSeconds
      : 0
    : sessionProgress;
  const progressName =
    mode === 'simple'
      ? 'Session progress'
      : singleDeck && progressNoun(singleDeck) === 'secured'
        ? 'Secured progress'
        : 'Predicted score progress';

  return (
    <motion.header
      initial={m > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={m > 0 ? { opacity: 0 } : undefined}
      transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
      onPointerLeave={onPointerLeave}
      className={cn(
        'left-0 right-0 top-0 z-20 border-b border-line bg-paper',
        'pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
        focusMode ? 'fixed shadow-lg shadow-black/5' : 'sticky',
      )}
    >
      <div className="flex min-h-[72px] items-center gap-1 px-2 py-2.5 md:gap-5 md:px-6">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          title="Open navigation"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
        >
          <MenuIcon width={18} height={18} />
        </button>

        <div className="min-w-10 flex-1 overflow-hidden">
          <h1
            className="mb-1 truncate text-xs font-semibold text-ink md:text-sm"
            title={info.title}
          >
            {info.title}
          </h1>
          {info.subtitle && (
            <p className="mb-1 hidden truncate text-xs text-ink-faint md:block">{info.subtitle}</p>
          )}
          {mode === 'simple' ? (
            <SessionSegments
              cardIds={sessionCardIds}
              outcomes={sessionCardOutcomes}
              currentCardId={currentCardId}
              value={displayedProgress}
              label={progressName}
            />
          ) : (
            <ObjectiveProgressTrack value={displayedProgress} label={progressName} m={m} />
          )}
        </div>

        {/* A planned revision window is a countdown rather than progress through a pile of
            cards, so it has no equivalent in the track below the title and stays here. */}
        {plannedRevision && (
          <span className="hidden whitespace-nowrap text-sm tabular text-ink-soft sm:inline">
            {`${Math.max(0, Math.ceil(revisionSecondsRemaining / 60))} min left`}
          </span>
        )}

        <div className="hidden min-[340px]:block">
          <PomodoroTimer />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Card actions"
            title="Card actions"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
          >
            <MoreIcon width={18} height={18} />
          </button>
          <AnimatePresence>
            {menuOpen &&
              current &&
              (isTouchMode ? (
                <TouchMenuSheet
                  current={current}
                  onEdit={onEdit}
                  onToggleFlag={onToggleFlag}
                  onBury={onBury}
                  onSuspend={onSuspend}
                  onShowShortcuts={onShowShortcuts}
                  onToggleFocus={onToggleFocus}
                  focusMode={focusMode}
                  onClose={() => setMenuOpen(false)}
                  m={m}
                />
              ) : (
                <motion.div
                  initial={m > 0 ? { opacity: 0, y: -4, scale: 0.98 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={m > 0 ? { opacity: 0, y: -4, scale: 0.98 } : undefined}
                  transition={{ duration: 0.12 * m }}
                  className="absolute right-0 top-11 z-20 w-52 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-xl shadow-black/10"
                >
                  {current.sequenceItemId === undefined &&
                    current.occlusionRegionId === undefined && (
                      <MenuItem
                        icon={<EditIcon width={16} height={16} />}
                        label="Edit card"
                        onClick={onEdit}
                      />
                    )}
                  <MenuItem
                    icon={<FlagIcon width={16} height={16} />}
                    label={current.flagged ? 'Remove flag' : 'Flag card'}
                    onClick={onToggleFlag}
                  />
                  <MenuItem
                    icon={<ClockIcon width={16} height={16} />}
                    label="Bury until tomorrow"
                    onClick={onBury}
                  />
                  <MenuItem
                    icon={<PauseIcon width={16} height={16} />}
                    label="Suspend card"
                    onClick={onSuspend}
                  />
                  <div className="border-t border-line" />
                  <MenuItem
                    icon={<FocusIcon width={16} height={16} />}
                    label={focusMode ? 'Leave focus mode' : 'Focus mode'}
                    onClick={onToggleFocus}
                  />
                  <MenuItem
                    icon={
                      isFullscreen ? (
                        <RestoreIcon width={16} height={16} />
                      ) : (
                        <FullscreenIcon width={16} height={16} />
                      )
                    }
                    label={isFullscreen ? 'Leave full screen' : 'Full screen'}
                    onClick={onToggleFullscreen}
                  />
                  <MenuItem
                    icon={<KeyboardIcon width={16} height={16} />}
                    label="Keyboard shortcuts"
                    onClick={onShowShortcuts}
                  />
                </motion.div>
              ))}
          </AnimatePresence>
        </div>

        {/* Focus mode keeps a control of its own only while it is active, so there is a
            visible way out of a chrome-less screen. Otherwise it lives in the menu. */}
        {focusMode && (
          <button
            type="button"
            onClick={onToggleFocus}
            aria-label="Exit Focus Mode"
            title="Exit Focus Mode (F)"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-accent transition-colors hover:bg-ink/5 active:bg-ink/10"
          >
            <FocusIcon width={19} height={19} />
          </button>
        )}

        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit
        </Button>
      </div>
    </motion.header>
  );
}

function ObjectiveProgressTrack({ value, label, m }: { value: number; label: string; m: number }) {
  const progress = Math.max(0, Math.min(1, value));
  return (
    // This track is now the session's only progress indicator, so it carries the
    // accessible name and value that the removed counter ring used to provide.
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-ink/10"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <motion.div
        initial={false}
        animate={{ scaleX: progress }}
        transition={{ duration: 0.32 * m, ease: [0.16, 1, 0.3, 1] }}
        className="h-full w-full origin-left rounded-full bg-accent"
      />
    </div>
  );
}

function SessionSegments({
  cardIds,
  outcomes,
  currentCardId,
  value,
  label,
}: {
  cardIds: string[];
  outcomes: Map<string, SessionCardOutcome>;
  currentCardId: string | null;
  value: number;
  label: string;
}) {
  const currentIndex = currentCardId === null ? -1 : cardIds.indexOf(currentCardId);
  const progressAnnouncement =
    currentIndex >= 0 ? `Card ${currentIndex + 1} of ${cardIds.length}` : 'Session complete';
  const maxSegments = 120;
  const groupSize = Math.max(1, Math.ceil(cardIds.length / maxSegments));
  const groups: string[][] = [];
  for (let index = 0; index < cardIds.length; index += groupSize) {
    groups.push(cardIds.slice(index, index + groupSize));
  }

  return (
    // The pip bar is the session's only progress indicator now that the counter ring
    // has gone, so it carries the value itself rather than being a decorative group
    // beside one. The live summary below still reports the per-card breakdown.
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(1, value)) * 100)}
      title={`${cardIds.length} cards in this session`}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {progressAnnouncement}
      </span>
      <div className="flex h-2 w-full gap-1" aria-hidden="true">
        {groups.map((group) => {
          const current = currentCardId !== null && group.includes(currentCardId);
          const groupOutcomes = group.map((id) => outcomes.get(id));
          const status = current
            ? 'current'
            : groupOutcomes.some((outcome) => outcome === 'wrong')
              ? 'wrong'
              : groupOutcomes.every((outcome) => outcome === 'correct')
                ? 'correct'
                : 'unseen';
          return (
            <span
              key={group[0]}
              data-session-card-status={status}
              className={cn(
                'min-w-px flex-1 rounded-full border transition-colors duration-200',
                status === 'correct' && 'border-positive bg-positive',
                status === 'wrong' && 'border-negative bg-negative',
                status === 'current' && 'border-accent bg-accent/10',
                status === 'unseen' && 'border-transparent bg-ink/10',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-h-11 items-center gap-3 px-4 py-2.5 text-left text-sm text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
    >
      <span className="shrink-0 text-ink-faint">{icon}</span>
      {label}
    </button>
  );
}
