import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CardContent } from './CardContent';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { deleteCards, moveCards } from '../../db/repository';
import { CheckIcon, EditIcon, PlusIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import type { Card, Deck } from '../../db/types';

interface CardListProps {
  cards: Card[];
  deck: Deck;
  allDecks: Deck[];
  onNewCard: () => void;
  onEditCard: (card: Card) => void;
}

export function CardList({ cards, deck, allDecks, onNewCard, onEditCard }: CardListProps) {
  const { notify } = useToast();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string>('');

  const otherDecks = useMemo(
    () => allDecks.filter((d) => d.id !== deck.id),
    [allDecks, deck.id],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleDelete() {
    const ids = [...selected];
    await deleteCards(ids);
    setConfirmDelete(false);
    exitSelect();
    notify(`${ids.length} card${ids.length === 1 ? '' : 's'} deleted.`);
  }

  async function handleMove() {
    if (!moveTarget) return;
    const ids = [...selected];
    await moveCards(ids, moveTarget);
    setMoveOpen(false);
    setMoveTarget('');
    exitSelect();
    notify(`${ids.length} card${ids.length === 1 ? '' : 's'} moved.`, 'positive');
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl">
          Cards <span className="text-ink-faint">({cards.length})</span>
        </h2>
        <div className="ml-auto flex gap-2">
          {cards.length > 0 && (
            <Button
              variant={selectMode ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            >
              {selectMode ? 'Done' : 'Select'}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onNewCard}>
            <PlusIcon width={16} height={16} />
            New card
          </Button>
        </div>
      </div>

      {selectMode && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line-strong bg-surface px-4 py-2.5">
          <span className="text-sm text-ink-soft">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={selected.size === 0 || otherDecks.length === 0}
              onClick={() => {
                setMoveTarget(otherDecks[0]?.id ?? '');
                setMoveOpen(true);
              }}
            >
              Move to…
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={selected.size === 0}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-16 text-center">
          <p className="mb-4 text-ink-soft">This deck has no cards yet.</p>
          <Button variant="primary" onClick={onNewCard}>
            <PlusIcon width={18} height={18} />
            Add your first card
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {cards.map((card, i) => (
            <CardRow
              key={card.id}
              card={card}
              index={i}
              selectMode={selectMode}
              selected={selected.has(card.id)}
              onToggle={() => toggle(card.id)}
              onEdit={() => onEditCard(card)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete cards"
        message={`Permanently delete ${selected.size} card${
          selected.size === 1 ? '' : 's'
        }? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <Modal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="Move cards"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleMove} disabled={!moveTarget}>
              Move
            </Button>
          </>
        }
      >
        <label className="block text-sm text-ink-soft">
          Destination deck
          <select
            value={moveTarget}
            onChange={(e) => setMoveTarget(e.target.value)}
            className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
          >
            {otherDecks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </Modal>
    </div>
  );
}

function CardRow({
  card,
  index,
  selectMode,
  selected,
  onToggle,
  onEdit,
}: {
  card: Card;
  index: number;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const reviewed = card.lastReviewed !== null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.25) }}
      onClick={selectMode ? onToggle : undefined}
      className={cn(
        'group relative flex items-start gap-4 rounded-xl border bg-surface p-4 transition-colors',
        selectMode && 'cursor-pointer',
        selected
          ? 'border-accent ring-2 ring-accent/30'
          : 'border-line hover:border-line-strong',
      )}
    >
      {selectMode && (
        <span
          className={cn(
            'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
            selected ? 'border-accent bg-accent text-[hsl(28_60%_14%)]' : 'border-line-strong',
          )}
        >
          {selected && <CheckIcon width={12} height={12} />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-ink-faint">
            {card.type === 'cloze' ? 'Cloze' : 'Front / Back'}
          </span>
          {reviewed ? (
            <span className="text-[11px] text-ink-faint tabular">
              Stability {card.stability!.toFixed(1)}d
            </span>
          ) : (
            <span className="text-[11px] text-accent">New</span>
          )}
        </div>
        <div className="max-h-24 overflow-hidden text-sm text-ink-soft [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
          <CardContent card={card} side="front" />
        </div>
      </div>

      {!selectMode && (
        <button
          type="button"
          onClick={onEdit}
          title="Edit card"
          className="shrink-0 rounded-lg p-2 text-ink-faint opacity-0 transition-opacity hover:bg-ink/5 hover:text-accent group-hover:opacity-100"
        >
          <EditIcon width={16} height={16} />
        </button>
      )}
    </motion.div>
  );
}
