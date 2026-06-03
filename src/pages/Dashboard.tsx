import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useDecks, useDeckSummaries } from '../state/useData';
import {
  createDeck,
  deleteDecks,
  mergeDecks,
} from '../db/repository';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useToast } from '../components/ui/Toast';
import { CheckIcon, MergeIcon, PlusIcon, TrashIcon } from '../components/ui/icons';
import { relativeExam } from '../utils/datetime';
import { cn } from '../components/ui/cn';
import type { Deck } from '../db/types';

export function Dashboard() {
  const decks = useDecks();
  const summaries = useDeckSummaries();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);

  const selectedDecks = useMemo(
    () => (decks ?? []).filter((d) => selected.has(d.id)),
    [decks, selected],
  );

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleCreate() {
    const deck = await createDeck(newName);
    setNewName('');
    setCreating(false);
    notify('Deck created.', 'positive');
    navigate(`/deck/${deck.id}`);
  }

  async function handleDelete() {
    const ids = [...selected];
    await deleteDecks(ids);
    setConfirmDelete(false);
    exitSelectMode();
    notify(`${ids.length} deck${ids.length === 1 ? '' : 's'} deleted.`);
  }

  async function handleMerge() {
    if (!mergeTarget) return;
    await mergeDecks([...selected], mergeTarget);
    setMergeOpen(false);
    setMergeTarget(null);
    exitSelectMode();
    notify('Decks merged.', 'positive');
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm uppercase tracking-[0.18em] text-ink-faint">
            Your revision
          </p>
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">Decks</h1>
        </div>
        <div className="flex items-center gap-2">
          {decks && decks.length > 0 && (
            <Button
              variant={selectMode ? 'primary' : 'secondary'}
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            >
              {selectMode ? 'Done' : 'Select'}
            </Button>
          )}
          <Button variant="primary" onClick={() => setCreating(true)}>
            <PlusIcon width={18} height={18} />
            New deck
          </Button>
        </div>
      </header>

      {/* Selection action bar */}
      {selectMode && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3"
        >
          <span className="text-sm text-ink-soft">
            {selected.size} selected
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={selected.size < 2}
              onClick={() => {
                setMergeTarget(selectedDecks[0]?.id ?? null);
                setMergeOpen(true);
              }}
            >
              <MergeIcon width={16} height={16} />
              Merge
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={selected.size === 0}
              onClick={() => setConfirmDelete(true)}
            >
              <TrashIcon width={16} height={16} />
              Delete
            </Button>
          </div>
        </motion.div>
      )}

      {/* Deck grid */}
      {!decks ? (
        <div className="text-ink-faint">Loading…</div>
      ) : decks.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck, i) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              index={i}
              summary={summaries?.[deck.id]}
              selectMode={selectMode}
              selected={selected.has(deck.id)}
              onToggleSelected={() => toggleSelected(deck.id)}
            />
          ))}
        </div>
      )}

      {/* Create deck modal */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New deck"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </>
        }
      >
        <label className="block text-sm text-ink-soft">
          Deck name
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newName.trim() && handleCreate()}
            placeholder="e.g. Organic Chemistry"
            className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
          />
        </label>
        <p className="mt-3 text-xs text-ink-faint">
          The exam date defaults to seven days from now. You will be asked to set the
          real date the first time you study this deck.
        </p>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete decks"
        message={`Permanently delete ${selected.size} deck${
          selected.size === 1 ? '' : 's'
        } and all their cards? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Merge modal */}
      <Modal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title="Merge decks"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleMerge} disabled={!mergeTarget}>
              Merge into selected
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-ink-soft">
          Choose which deck to keep. All cards from the other selected decks move into
          it; the kept deck retains its name, exam date and performance history.
        </p>
        <div className="flex flex-col gap-2">
          {selectedDecks.map((deck) => (
            <label
              key={deck.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                mergeTarget === deck.id
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name="merge-target"
                checked={mergeTarget === deck.id}
                onChange={() => setMergeTarget(deck.id)}
                className="accent-accent"
              />
              <span className="text-sm">{deck.name}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function DeckCard({
  deck,
  summary,
  index,
  selectMode,
  selected,
  onToggleSelected,
}: {
  deck: Deck;
  summary: { count: number; mastery: number; unreviewed: number } | undefined;
  index: number;
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const body = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
      className={cn(
        'group relative flex h-full flex-col rounded-2xl border bg-surface p-5 transition-all',
        selected
          ? 'border-accent ring-2 ring-accent/30'
          : 'border-line hover:border-line-strong hover:shadow-lg hover:shadow-black/5',
      )}
    >
      {selectMode && (
        <span
          className={cn(
            'absolute right-4 top-4 grid h-6 w-6 place-items-center rounded-full border transition-colors',
            selected ? 'border-accent bg-accent text-[hsl(28_60%_14%)]' : 'border-line-strong',
          )}
        >
          {selected && <CheckIcon width={14} height={14} />}
        </span>
      )}

      <div className="mb-1 text-xs uppercase tracking-[0.14em] text-ink-faint">
        Exam {relativeExam(deck.examDate)}
      </div>
      <h3 className="mb-4 font-display text-2xl leading-tight tracking-tight">
        {deck.name}
      </h3>

      <div className="mt-auto">
        <div className="mb-2 flex items-center justify-between text-sm text-ink-soft">
          <span>{summary?.count ?? 0} cards</span>
          <span className="tabular">
            {Math.round((summary?.mastery ?? 0) * 100)}% mastered
          </span>
        </div>
        <ProgressBar value={summary?.mastery ?? 0} height={8} />
      </div>
    </motion.div>
  );

  if (selectMode) {
    return (
      <button type="button" onClick={onToggleSelected} className="text-left">
        {body}
      </button>
    );
  }
  return <Link to={`/deck/${deck.id}`}>{body}</Link>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong py-20 text-center">
      <h2 className="mb-2 font-display text-2xl">No decks yet</h2>
      <p className="mb-6 max-w-sm text-ink-soft">
        Create your first deck to begin building a revision schedule tuned to your exam.
      </p>
      <Button variant="primary" onClick={onCreate}>
        <PlusIcon width={18} height={18} />
        Create a deck
      </Button>
    </div>
  );
}
