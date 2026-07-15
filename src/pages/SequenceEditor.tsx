// Full-page composer for creating and editing a Sequence (an overlapping-cloze
// source document that derives ordinary front/back FSRS cards). Mirrors
// CardEditor's shape: the route decides create vs edit mode, a sticky action
// bar drives save/cancel, and deletion (edit mode only) uses the app's
// undo-toast idiom via DangerZoneSection.
// Route: course/:courseId/sequence/new, course/:courseId/sequence/:sequenceId/edit,
// and the lesson-scoped course/:courseId/lesson/:lessonId/sequence/new variant.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'motion/react';
import { useCourse, useLesson, useSequence } from '../state/useCourseData';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { DangerZoneSection } from './settings/DangerZoneSection';
import { SequenceItemRow } from '../components/sequences/SequenceItemRow';
import { ChevronLeftIcon, PlusIcon } from '../components/ui/icons';
import { cn } from '../components/ui/cn';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import { makeId } from '../db/schema';
import { generateCards } from '../db/sequenceGeneration';
import {
  createSequence,
  deleteSequence,
  restoreSequence,
  snapshotSequence,
  updateSequence,
  type SequenceSnapshot,
} from '../db/repository';
import type { SequenceItem } from '../db/types';

export function SequenceEditor() {
  const { sequenceId, courseId, lessonId } = useParams<{
    sequenceId?: string;
    courseId?: string;
    lessonId?: string;
  }>();
  const lessonMode = Boolean(lessonId);
  const navigate = useNavigate();
  const { notify } = useToast();

  const course = useCourse(courseId);
  const lesson = useLesson(lessonId);
  const editing = Boolean(sequenceId);
  const sequence = useSequence(sequenceId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<SequenceItem[]>([]);
  const [cueWindow, setCueWindow] = useState(2);
  const [chunkLabels, setChunkLabels] = useState<string[]>([]);
  const [generateLabelCards, setGenerateLabelCards] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invalidItems, setInvalidItems] = useState<Set<string>>(() => new Set());
  const itemInputs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingItemFocus = useRef<string | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const reduceMotion = m === 0;

  // Seed the form from the sequence being edited once it has loaded (new sequences start
  // with one blank item, since a sequence with zero items generates no cards).
  useEffect(() => {
    if (loaded) return;
    if (!editing) {
      setItems([{ id: makeId(), value: '' }]);
      setLoaded(true);
      return;
    }
    if (sequence) {
      setName(sequence.name);
      setDescription(sequence.description ?? '');
      setItems(sequence.items);
      setCueWindow(sequence.cueWindow);
      setChunkLabels(sequence.chunkLabels ?? []);
      setGenerateLabelCards(sequence.generateLabelCards ?? false);
      setLoaded(true);
    }
  }, [editing, sequence, loaded]);

  // Adding an item is a quick-capture operation: keep the author at the working
  // position, then focus and reveal the new value editor after React mounts it.
  useEffect(() => {
    const id = pendingItemFocus.current;
    if (!id) return;
    const input = itemInputs.current.get(id);
    if (!input) return;
    pendingItemFocus.current = null;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [items, reduceMotion]);

  const lessonPath = `/course/${courseId}/lesson/${lessonId}`;
  const bankPath = `/course/${courseId}/bank`;
  const backPath = lessonMode ? lessonPath : bankPath;

  const preview = useMemo(() => {
    if (!loaded) return [];
    return generateCards({
      id: sequence?.id ?? 'preview',
      courseId: courseId ?? '',
      primaryLessonId: lessonId ?? null,
      name: name.trim() || 'Untitled sequence',
      description,
      items,
      cueWindow,
      chunkLabels,
      generateLabelCards,
      createdAt: sequence?.createdAt ?? 0,
    });
  }, [
    loaded,
    sequence,
    courseId,
    lessonId,
    name,
    description,
    items,
    cueWindow,
    chunkLabels,
    generateLabelCards,
  ]);

  if (
    (lessonMode ? course === undefined || lesson === undefined : course === undefined) ||
    (editing && sequence === undefined && !loaded)
  ) {
    return <SequenceEditorSkeleton />;
  }
  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent underline">Back to dashboard</Link>
      </div>
    );
  }
  if (lessonMode && lesson === null) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-10">
        <p className="mb-4 text-ink-soft">This lesson could not be found.</p>
        <Link to={courseId ? `/course/${courseId}` : '/'} className="text-accent underline">
          {courseId ? 'Back to course' : 'Back to dashboard'}
        </Link>
      </motion.div>
    );
  }
  if (editing && sequence === null) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-10">
        <p className="mb-4 text-ink-soft">This sequence could not be found.</p>
        <Link to={backPath} className="text-accent underline">
          Back to {lessonMode ? lesson?.name : 'Question bank'}
        </Link>
      </motion.div>
    );
  }

  const canSave =
    name.trim().length > 0 && items.length > 0 && items.every((i) => i.value.trim().length > 0);

  function updateItem(id: string, patch: Partial<SequenceItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    if (patch.value?.trim()) {
      setInvalidItems((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function addItem(afterId?: string) {
    const precedingItem = afterId
      ? items.find((item) => item.id === afterId)
      : items[items.length - 1];
    if (precedingItem && !precedingItem.value.trim()) {
      setInvalidItems((prev) => new Set(prev).add(precedingItem.id));
      itemInputs.current.get(precedingItem.id)?.focus();
      return;
    }
    const item = { id: makeId(), value: '' };
    pendingItemFocus.current = item.id;
    setItems((prev) => {
      if (!afterId) return [...prev, item];
      const index = prev.findIndex((candidate) => candidate.id === afterId);
      if (index === -1) return [...prev, item];
      const next = [...prev];
      next.splice(index + 1, 0, item);
      return next;
    });
  }

  function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setInvalidItems((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function moveItem(id: string, direction: 'up' | 'down') {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }

  function addChunkLabel() {
    setChunkLabels((prev) => [...prev, `Chunk ${prev.length + 1}`]);
  }

  function renameChunkLabel(index: number, label: string) {
    setChunkLabels((prev) => prev.map((l, i) => (i === index ? label : l)));
  }

  function deleteChunkLabel(index: number) {
    setChunkLabels((prev) => prev.filter((_, i) => i !== index));
    // Items referencing this or a later chunk lose/shift their assignment so
    // indices stay in sync with the (now shorter) chunkLabels array.
    setItems((prev) =>
      prev.map((item) => {
        if (item.chunkIndex === undefined) return item;
        if (item.chunkIndex === index) return { ...item, chunkIndex: undefined };
        if (item.chunkIndex > index) return { ...item, chunkIndex: item.chunkIndex - 1 };
        return item;
      }),
    );
  }

  async function handleSave() {
    if (!canSave || !courseId) return;
    setSaving(true);
    try {
      const opts = {
        description: description.trim() || undefined,
        cueWindow,
        chunkLabels: chunkLabels.length > 0 ? chunkLabels : undefined,
        generateLabelCards,
      };
      if (editing && sequence) {
        await updateSequence({ ...sequence, name: name.trim(), items, ...opts });
        notify('Sequence updated.', 'positive');
      } else {
        await createSequence(courseId, lessonId ?? null, name, items, opts);
        notify('Sequence added.', 'positive');
      }
      navigate(backPath);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pb-10 pt-8 md:px-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-ink-faint">
        <Link to={`/course/${courseId}`} className="transition-colors hover:text-ink">
          {course?.name}
        </Link>
        <ChevronRight />
        <Link to={backPath} className="transition-colors hover:text-ink">
          {lessonMode ? lesson?.name : 'Question bank'}
        </Link>
        <ChevronRight />
        <span className="text-ink-soft">{editing ? 'Edit sequence' : 'New sequence'}</span>
      </nav>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8">
          <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
          <div className="relative">
            <Link
              to={backPath}
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
            >
              <ChevronLeftIcon width={16} height={16} />
              Back
            </Link>
            <h1 className="font-display text-4xl tracking-tight md:text-5xl">
              {editing ? 'Edit sequence' : 'New sequence'}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-ink-soft">
              An ordered list you memorise in order — each item&rsquo;s card cues on the ones before
              it.
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Name</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Krebs cycle"
              className="w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-ink outline-none focus:border-accent"
            />
          </div>
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">
              Description <span className="normal-case text-ink-faint/70">(optional)</span>
            </div>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this sequence covers…"
              className="w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-ink outline-none focus:border-accent"
            />
          </div>

          {/* Chunks */}
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.14em] text-ink-faint">
                Chunks <span className="normal-case text-ink-faint/70">(optional)</span>
              </div>
              <Button variant="ghost" size="sm" onClick={addChunkLabel}>
                <PlusIcon width={14} height={14} />
                Add chunk
              </Button>
            </div>
            {chunkLabels.length === 0 ? (
              <p className="text-sm text-ink-faint">
                Group items into named chunks (e.g. verses, stages) to label their cards.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {chunkLabels.map((label, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={label}
                          onChange={(e) => renameChunkLabel(i, e.target.value)}
                          className="flex-1 rounded-lg border border-line bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={() => deleteChunkLabel(i)}
                          title="Delete chunk"
                          className="rounded-lg px-2 py-1 text-xs text-ink-faint transition-colors hover:bg-negative/10 hover:text-negative"
                        >
                          Delete
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="flex flex-wrap items-center gap-6 rounded-xl border border-line bg-surface p-4">
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              Cue window
              <input
                type="number"
                min={1}
                max={items.length || 1}
                value={cueWindow}
                onChange={(e) => setCueWindow(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 rounded-lg border border-line bg-transparent px-2 py-1 text-center outline-none focus:border-accent"
              />
              <span className="text-ink-faint">
                preceding item{cueWindow === 1 ? '' : 's'} shown as cue
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={generateLabelCards}
                onChange={(e) => setGenerateLabelCards(e.target.checked)}
                className="accent-accent"
              />
              Also generate label → value cards
            </label>
          </div>

          {/* Items */}
          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.14em] text-ink-faint">
                Items <span className="text-ink-faint/70">({items.length})</span>
              </div>
              <span className="text-xs text-ink-faint">Ctrl/Cmd+Enter adds the next item</span>
            </div>
            <div className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {items.map((item, i) => (
                  <motion.div
                    key={item.id}
                    layout={reduceMotion ? undefined : 'position'}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <SequenceItemRow
                      item={item}
                      index={i}
                      isFirst={i === 0}
                      isLast={i === items.length - 1}
                      chunkLabels={chunkLabels}
                      onChange={(patch) => updateItem(item.id, patch)}
                      onDelete={() => deleteItem(item.id)}
                      onMoveUp={() => moveItem(item.id, 'up')}
                      onMoveDown={() => moveItem(item.id, 'down')}
                      onAddAfter={() => addItem(item.id)}
                      invalid={invalidItems.has(item.id)}
                      inputRef={(input) => {
                        if (input) itemInputs.current.set(item.id, input);
                        else itemInputs.current.delete(item.id);
                      }}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              <Button
                type="button"
                variant="ghost"
                onClick={() => addItem()}
                title="Add another item (Ctrl/Cmd+Enter while editing an item)"
                className="w-full border border-dashed border-line-strong text-ink-faint hover:border-accent/50 hover:text-accent"
              >
                <PlusIcon width={14} height={14} />
                Add another item
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.14em] text-ink-faint">Preview</div>
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-medium',
                  preview.length > 30
                    ? 'bg-amber-500/10 text-amber-700'
                    : 'bg-accent-soft text-accent',
                )}
              >
                {preview.length} card{preview.length === 1 ? '' : 's'} generated
              </span>
            </div>
            {preview.length === 0 ? (
              <p className="text-sm text-ink-faint">
                Add items to see the cards this sequence will generate.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {preview.map((payload, i) => (
                  <div key={i} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <div className="whitespace-pre-wrap text-ink-soft">{payload.front}</div>
                    <div className="mt-1 border-t border-line pt-1 text-ink">{payload.back}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editing && sequence && (
            <DangerZoneSection
              entityLabel="sequence"
              entityName={sequence.name}
              description="Deletes this sequence and every card it generated."
              snapshot={() => snapshotSequence(sequence.id)}
              onDelete={() => deleteSequence(sequence.id)}
              onRestore={(snap) => restoreSequence(snap as SequenceSnapshot)}
              onDeleted={() => navigate(backPath)}
            />
          )}
        </div>
      </motion.div>

      {/* Sticky action bar */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25 * m, ease: [0.16, 1, 0.3, 1] }}
        role="region"
        aria-label="Sequence editor actions"
        className="pointer-events-none sticky bottom-0 z-30 -mx-6 mt-8 bg-gradient-to-t from-paper via-paper to-transparent px-6 pb-5 pt-12 md:-mx-10 md:px-10"
      >
        <div className="pointer-events-auto ml-auto flex w-fit items-center gap-3">
          <Button variant="ghost" onClick={() => navigate(backPath)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
            {editing ? 'Save changes' : 'Add sequence'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function SequenceEditorSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-6 pb-10 pt-8 md:px-10">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mb-8 rounded-2xl border border-line bg-surface p-6">
        <div className="mb-1 h-3 w-20 animate-pulse rounded bg-ink/10" />
        <div className="h-10 w-48 animate-pulse rounded bg-ink/10" />
      </div>
      <div className="flex flex-col gap-5">
        <div className="h-10 w-full animate-pulse rounded-lg bg-ink/10" />
        <div className="h-40 w-full animate-pulse rounded-lg bg-ink/10" />
        <div className="h-40 w-full animate-pulse rounded-lg bg-ink/10" />
      </div>
    </div>
  );
}

function ChevronRight() {
  return <span className="text-ink-faint/60">/</span>;
}
