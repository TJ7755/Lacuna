// Card-list section for LessonView — demoted heading, empty state, and the
// resolving-deck skeleton. Extracted from LessonView.tsx alongside
// LessonNotesSection so the page component stays a thin layout/data shell.

import { CardList } from './CardList';
import { Button } from '../ui/Button';
import { PlusIcon } from '../ui/icons';
import type { Card, Deck } from '../../db/types';

interface LessonCardsSectionProps {
  courseId: string;
  lessonId: string;
  lessonCards: Card[];
  lessonDeck: Deck | undefined;
  onNavigate: (path: string) => void;
  className?: string;
}

export function LessonCardsSection({
  courseId,
  lessonId,
  lessonCards,
  lessonDeck,
  onNavigate,
  className,
}: LessonCardsSectionProps) {
  return (
    <section className={className}>
      <h2 className="mb-4 font-display text-xl text-ink-soft">
        Cards <span className="text-ink-faint">({lessonCards.length})</span>
      </h2>

      {lessonCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-12 text-center">
          <p className="mb-4 text-sm text-ink-soft">No cards in this lesson yet.</p>
          <Button
            variant="primary"
            onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
          >
            <PlusIcon width={18} height={18} />
            Add your first card
          </Button>
        </div>
      ) : lessonDeck ? (
        <CardList
          cards={lessonCards}
          deck={lessonDeck}
          allDecks={[lessonDeck]}
          hideHeader
          onNewCard={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
          onEditCard={(card) => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/${card.id}/edit`)}
        />
      ) : (
        // Deck is still resolving; show a brief skeleton rather than blocking the page.
        <div className="space-y-3">
          {Array.from({ length: Math.min(lessonCards.length, 3) }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-line bg-ink/5" />
          ))}
        </div>
      )}
    </section>
  );
}
