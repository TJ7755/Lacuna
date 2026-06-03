import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  useCards,
  useDeck,
  useDecks,
  useSessionHistory,
} from '../state/useData';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { CardList } from '../components/cards/CardList';
import { CardEditorModal } from '../components/cards/CardEditorModal';
import { DeckSettingsModal } from '../components/cards/DeckSettingsModal';
import { ExamDatePrompt } from '../components/cards/ExamDatePrompt';
import { DeckAnalytics } from '../components/analytics/DeckAnalytics';
import {
  progressDescription,
  progressHeading,
  progressValue,
} from '../fsrs/objective';
import { formatDateTime, relativeExam } from '../utils/datetime';
import {
  CardsIcon,
  ChartIcon,
  ChevronLeftIcon,
  PlayIcon,
  SettingsIcon,
} from '../components/ui/icons';
import { cn } from '../components/ui/cn';
import type { Card } from '../db/types';

type Tab = 'cards' | 'analytics';

export function DeckView() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const deck = useDeck(deckId);
  const cards = useCards(deckId);
  const allDecks = useDecks();
  const history = useSessionHistory(deckId);

  const [tab, setTab] = useState<Tab>('cards');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [examPromptOpen, setExamPromptOpen] = useState(false);

  if (deck === undefined || cards === undefined) {
    return <div className="p-10 text-ink-faint">Loading…</div>;
  }
  if (deck === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This deck could not be found.</p>
        <Link to="/" className="text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const progress = progressValue(cards, deck);

  function startStudy() {
    if (cards!.length === 0) return;
    if (!deck!.examDatePromptDismissed) {
      setExamPromptOpen(true);
    } else {
      navigate(`/deck/${deck!.id}/learn`);
    }
  }

  function openNewCard() {
    setEditingCard(null);
    setEditorOpen(true);
  }

  function openEditCard(card: Card) {
    setEditingCard(card);
    setEditorOpen(true);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      {/* Breadcrumb */}
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        All decks
      </Link>

      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 text-sm uppercase tracking-[0.16em] text-ink-faint">
              Exam {relativeExam(deck.examDate)} · {formatDateTime(deck.examDate)}
            </div>
            <h1 className="font-display text-4xl tracking-tight md:text-5xl">
              {deck.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setSettingsOpen(true)}
              aria-label="Deck settings"
              title="Deck settings"
            >
              <SettingsIcon width={18} height={18} />
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={startStudy}
              disabled={cards.length === 0}
            >
              <PlayIcon width={18} height={18} />
              Study
            </Button>
          </div>
        </div>

        {/* Mastery summary */}
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-ink-soft">{progressHeading(deck)}</span>
            <span className="tabular font-medium text-ink">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <ProgressBar value={progress} />
          <p className="mt-3 text-xs text-ink-faint">{progressDescription(deck)}</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-line">
        <TabButton active={tab === 'cards'} onClick={() => setTab('cards')} icon={<CardsIcon width={16} height={16} />}>
          Cards
        </TabButton>
        <TabButton
          active={tab === 'analytics'}
          onClick={() => setTab('analytics')}
          icon={<ChartIcon width={16} height={16} />}
        >
          Analytics
        </TabButton>
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === 'cards' ? (
          <CardList
            cards={cards}
            deck={deck}
            allDecks={allDecks ?? []}
            onNewCard={openNewCard}
            onEditCard={openEditCard}
          />
        ) : (
          <DeckAnalytics cards={cards} history={history ?? []} />
        )}
      </motion.div>

      {/* Modals */}
      <CardEditorModal
        open={editorOpen}
        deckId={deck.id}
        card={editingCard}
        onClose={() => setEditorOpen(false)}
      />
      <DeckSettingsModal
        open={settingsOpen}
        deck={deck}
        onClose={() => setSettingsOpen(false)}
      />
      <ExamDatePrompt
        open={examPromptOpen}
        deck={deck}
        onResolved={() => {
          setExamPromptOpen(false);
          navigate(`/deck/${deck.id}/learn`);
        }}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-4 py-2.5 text-sm transition-colors',
        active ? 'text-accent' : 'text-ink-soft hover:text-ink',
      )}
    >
      {icon}
      {children}
      {active && (
        <motion.span
          layoutId="deck-tab"
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
        />
      )}
    </button>
  );
}
