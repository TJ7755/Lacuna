import { useMemo, useState } from 'react';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { linkCardsToLesson } from '../../db/repository';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { CheckIcon, CloseIcon, SearchIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import type { Card, Lesson } from '../../db/types';

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
      notify(error instanceof Error ? error.message : 'Could not link the selected cards.', 'negative');
    }
  }

  return (
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-50 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Link existing cards"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative z-10 m-auto flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line-strong bg-paper shadow-2xl shadow-black/20"
      >
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-xl">Link existing cards</h2>
            <p className="mt-1 text-sm text-ink-faint">
              Linked cards keep their original lesson and scheduling progress.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close card picker"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </header>

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
              className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pl-10 pr-4 text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line">
            {filteredCards.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-soft">
                {cards.length === 0 ? 'Every course card is already in this lesson.' : 'No cards match your search.'}
              </p>
            ) : (
              <div className="divide-y divide-line">
                {filteredCards.map((card) => {
                  const isSelected = selected.has(card.id);
                  const source = card.primaryLessonId
                    ? lessonNames.get(card.primaryLessonId) ?? 'Unknown lesson'
                    : 'Question bank';
                  return (
                    <button
                      key={card.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggle(card.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/[0.03]"
                    >
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{card.front}</span>
                        <span className="mt-1 block text-xs text-ink-faint">From {source}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <span className="text-sm text-ink-faint">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
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
      </motion.div>
    </motion.div>
  );
}
