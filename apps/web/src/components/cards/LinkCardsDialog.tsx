import { CardContent } from './CardContent';
import { useMemo, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { linkCardsToLesson } from '../../db/lessonRepository';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { CheckIcon, SearchIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import type { Card, Lesson } from '@lacuna/core/db/types';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';

interface LinkCardsDialogProps {
  lessonId: string;
  cards: Card[];
  lessons: Lesson[];
  onLinked: () => void;
  onCancel: () => void;
}

/** Selects existing course cards to appear additionally in the current lesson. */
export function LinkCardsDialog({
  lessonId,
  cards,
  lessons,
  onLinked,
  onCancel,
}: LinkCardsDialogProps) {
  const { notify } = useToast();
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[data-link-card-search]' });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const lessonNames = useMemo(
    () => new Map(lessons.map((lesson) => [lesson.id, lesson.name])),
    [lessons],
  );
  const normalisedQuery = query.trim().toLocaleLowerCase();
  const filteredCards = useMemo(
    () =>
      cards.filter(
        (card) =>
          !normalisedQuery ||
          card.front.toLocaleLowerCase().includes(normalisedQuery) ||
          card.back.toLocaleLowerCase().includes(normalisedQuery),
      ),
    [cards, normalisedQuery],
  );

  function toggle(cardId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  async function handleLink() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await linkCardsToLesson(lessonId, [...selected]);
      notify(
        `${selected.size} card${selected.size === 1 ? '' : 's'} linked to this lesson.`,
        'positive',
      );
      onLinked();
    } catch (error) {
      setSaving(false);
      notify(
        error instanceof Error ? error.message : 'Could not link the selected cards.',
        'negative',
      );
    }
  }

  return (
    <DialogPanel
      label="Link existing cards"
      trapRef={trapRef}
      onBackdropClick={onCancel}
      className="max-h-[90vh] max-w-2xl"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <DialogHeader title="Link existing cards" onClose={onCancel} closeLabel="Close card picker" />

      <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
        <label className="relative mb-4 block">
          <span className="sr-only">Search cards</span>
          <SearchIcon
            width={16}
            height={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            data-link-card-search
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cards…"
            className="min-h-11 w-full rounded-full border-[1.5px] border-line bg-surface py-2.5 pl-10 pr-4 text-ink outline-none focus:border-accent"
          />
        </label>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-line">
          {filteredCards.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-soft">
              {cards.length === 0
                ? 'Every course card is already in this lesson.'
                : 'No cards match your search.'}
            </p>
          ) : (
            <div className="divide-y divide-line">
              {filteredCards.map((card) => {
                const isSelected = selected.has(card.id);
                const source = card.primaryLessonId
                  ? (lessonNames.get(card.primaryLessonId) ?? 'Unknown lesson')
                  : 'Cards';
                return (
                  <div
                    key={card.id}
                    className={cn(
                      'relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                      isSelected ? 'bg-accent-soft' : 'hover:bg-ink/[0.03]',
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${card.front} From ${source}`}
                      onClick={() => toggle(card.id)}
                      className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink"
                    />
                    <span
                      className={cn(
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                        isSelected
                          ? 'border-accent bg-accent text-accent-fg'
                          : 'border-line-strong',
                      )}
                    >
                      {isSelected && <CheckIcon width={12} height={12} />}
                    </span>
                    <div className="pointer-events-none min-w-0 flex-1" inert>
                      <CardContent
                        card={card}
                        side="front"
                        className="card-row-clamp line-clamp-2 max-h-[3.75rem] text-sm text-ink"
                      />
                      <span className="mt-1 block text-xs text-ink-faint">From {source}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
        <span className="text-sm text-ink-faint">{selected.size} selected</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={selected.size === 0 || saving}
            onClick={() => void handleLink()}
          >
            {selected.size === 0
              ? 'Link cards'
              : `Link ${selected.size} card${selected.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </footer>
    </DialogPanel>
  );
}
