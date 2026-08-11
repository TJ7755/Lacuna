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
        title: singleDeck ? `${deckName} · Simple learn` : 'Simple learn · all courses',
        subtitle: 'Loop until every card is correct',
      };
    case 'cram':
      return {
        title: `${deckName} · Revision plan`,
        subtitle: `Ordinary Practice ordering${revisionNextWindowDay ? ` · Next ${revisionNextWindowDay}` : ''}`,
      };
    case 'filtered-due':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart || 'Only cards that are due today',
      };
    case 'filtered-new':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart || 'Only cards you have not seen yet',
      };
    case 'filtered-leech':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart || 'Only leech cards',
      };
    case 'filtered-flagged':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart || 'Only flagged cards',
      };
    case 'filtered-suspended':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart || 'Only suspended cards',
      };
    case 'filtered':
      return {
        title: `${deckName} · ${filterPart}`,
        subtitle: tagPart || 'Filtered cards',
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
  const percentage = Math.round(Math.max(0, Math.min(1, displayedProgress)) * 100);
  const progressName =
    mode === 'simple'
      ? 'Session progress'
      : singleDeck && progressNoun(singleDeck) === 'secured'
        ? 'Secured progress'
        : 'Predicted score progress';
  const compactProgressNoun = progressName.replace(' progress', '').toLowerCase();

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
      onPointerLeave={onPointerLeave}
      className={cn(
        'left-0 right-0 top-0 z-20 border-b border-line bg-paper/92 backdrop-blur-xl',
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
            />
          ) : (
            <ObjectiveProgressTrack value={displayedProgress} m={m} />
          )}
        </div>

        <span className="hidden whitespace-nowrap text-sm tabular text-ink-soft sm:inline">
          {plannedRevision
            ? `${Math.max(0, Math.ceil(revisionSecondsRemaining / 60))} min left`
            : `${percentage}%${mode === 'simple' ? '' : ` ${compactProgressNoun}`}`}
        </span>
        <SessionProgressRing
          value={displayedProgress}
          label={plannedRevision ? 'Revision window time' : progressName}
          m={m}
        />

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
                  onClose={() => setMenuOpen(false)}
                  m={m}
                />
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.12 * m }}
                  className="absolute right-0 top-11 z-20 w-52 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-xl shadow-black/10"
                >
                  {current.sequenceItemId === undefined && current.occlusionRegionId === undefined && (
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
                    icon={<KeyboardIcon width={16} height={16} />}
                    label="Keyboard shortcuts"
                    onClick={onShowShortcuts}
                  />
                </motion.div>
              ))}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={onToggleFocus}
          aria-label={focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'}
          title={focusMode ? 'Exit Focus Mode (F)' : 'Enter Focus Mode (F)'}
          className={cn(
            'h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-ink/5 active:bg-ink/10',
            focusMode ? 'flex' : 'hidden sm:flex',
            focusMode ? 'text-accent' : 'text-ink-soft hover:text-ink',
          )}
        >
          <FocusIcon width={19} height={19} />
        </button>

        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Leave full screen' : 'Enter full screen'}
          title={isFullscreen ? 'Leave full screen' : 'Enter full screen'}
          className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10 sm:flex"
        >
          {isFullscreen ? (
            <RestoreIcon width={19} height={19} />
          ) : (
            <FullscreenIcon width={19} height={19} />
          )}
        </button>

        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit
        </Button>
      </div>
    </motion.header>
  );
}

function ObjectiveProgressTrack({ value, m }: { value: number; m: number }) {
  const progress = Math.max(0, Math.min(1, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
      <motion.div
        initial={false}
        animate={{ width: `${progress * 100}%` }}
        transition={{ duration: 0.32 * m, ease: [0.16, 1, 0.3, 1] }}
        className="h-full rounded-full bg-accent"
      />
    </div>
  );
}

function SessionSegments({
  cardIds,
  outcomes,
  currentCardId,
}: {
  cardIds: string[];
  outcomes: Map<string, SessionCardOutcome>;
  currentCardId: string | null;
}) {
  const statusFor = (id: string): SessionCardOutcome | 'current' | 'unseen' => {
    if (id === currentCardId) return 'current';
    return outcomes.get(id) ?? 'unseen';
  };
  const statuses = cardIds.map(statusFor);
  const statusSummary = `${statuses.filter((status) => status === 'correct').length} correct, ${statuses.filter((status) => status === 'wrong').length} wrong, ${statuses.filter((status) => status === 'current').length} current, ${statuses.filter((status) => status === 'unseen').length} unseen`;
  const maxSegments = 120;
  const groupSize = Math.max(1, Math.ceil(cardIds.length / maxSegments));
  const groups: string[][] = [];
  for (let index = 0; index < cardIds.length; index += groupSize) {
    groups.push(cardIds.slice(index, index + groupSize));
  }

  return (
    <div aria-label="Card progress" role="group" title={`${cardIds.length} cards in this session`}>
      <span className="sr-only" aria-live="polite">
        {statusSummary}
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

function SessionProgressRing({ value, label, m }: { value: number; label: string; m: number }) {
  const progress = Math.max(0, Math.min(1, value));
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.round(progress * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center"
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={radius} fill="none" className="stroke-ink/10" strokeWidth="3" />
        <motion.circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          className="stroke-accent"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ duration: 0.32 * m, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span className="text-[9px] font-semibold tabular text-ink-soft sm:hidden">{percentage}</span>
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
