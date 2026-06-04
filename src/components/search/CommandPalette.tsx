import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAllCards, useDecks } from '../../state/useData';
import { plainPreview, searchCards } from '../../db/search';
import { SearchIcon } from '../ui/icons';

const MAX_RESULTS = 40;

/** A keyboard-summoned (Ctrl/Cmd+K) overlay for searching every card. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const decks = useDecks();
  const cards = useAllCards();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const results = useMemo(
    () => searchCards(query, cards ?? [], decks ?? []).slice(0, MAX_RESULTS),
    [query, cards, decks],
  );

  // Reset and focus whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  function go(index: number) {
    const hit = results[index];
    if (!hit) return;
    onClose();
    navigate(`/deck/${hit.card.deckId}/cards/${hit.card.id}/edit`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(active);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black/20"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <SearchIcon width={18} height={18} className="text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search all cards…"
                className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
              />
              <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">
                Esc
              </kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {query.trim() === '' ? (
                <p className="px-4 py-6 text-center text-sm text-ink-faint">
                  Type to search across every deck.
                </p>
              ) : results.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-faint">
                  No cards match “{query}”.
                </p>
              ) : (
                <ul className="py-1">
                  {results.map((hit, i) => (
                    <li key={hit.card.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(i)}
                        className={
                          'flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors ' +
                          (i === active ? 'bg-accent-soft' : 'hover:bg-ink/5')
                        }
                      >
                        <span className="truncate text-sm text-ink">
                          {plainPreview(hit.card.front, 90) || '(empty front)'}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-ink-faint">
                          <span className="truncate">{hit.deck.name}</span>
                          {(hit.card.tags ?? []).length > 0 && (
                            <span className="truncate">· {hit.card.tags!.join(', ')}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
