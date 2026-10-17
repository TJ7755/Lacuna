import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { dialogKeyDown } from '../../hooks/dialogKeys';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { TagInput } from '../ui/TagInput';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { scaledSpring } from '../ui/motion';
import { useToast } from '../ui/Toast';
import { PillToggleGroup, type PillToggleOption } from './PillToggleGroup';
import { EDITOR_TYPE_ORDER } from './CardTypePicker';
import { updateCard } from '../../db/cardRepository';
import { hasCloze } from '../../utils/cloze';
import { saveDraft, loadDraft, clearDraft, draftKey } from '../../utils/drafts';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import type { Card, CardType } from '../../db/types';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';

/** The stored types this overlay can save, labelled as the full editor's picker labels them. */
const CARD_TYPE_OPTIONS = [
  { value: 'front_back', label: 'Front / back' },
  { value: 'cloze', label: 'Cloze deletion' },
  { value: 'basic_reversed', label: 'Basic (reversed)' },
] as const satisfies readonly PillToggleOption<CardType>[];

interface CardEditOverlayProps {
  card: Card;
  /** Course/Lesson scope for drafts; omitted for legacy global Deck sessions. */
  draftScope?: string;
  /** Existing tags across the deck, offered as suggestions in the tag input. */
  tagSuggestions?: string[];
  /** Called with the in-memory updated card once the change is persisted. */
  onSaved: (updated: Card) => void;
  onCancel: () => void;
}

/**
 * A focused, modal editor for a single existing card. Used to fix a card mid-review
 * without leaving the session: it reuses the same MarkdownEditor/TagInput surface as the
 * full-page composer but stays self-contained so the study screen keeps its place. The
 * overlay owns the keyboard while open, so typing never grades the card underneath.
 */
export function CardEditOverlay({
  card,
  draftScope,
  tagSuggestions = [],
  onSaved,
  onCancel,
}: CardEditOverlayProps) {
  const { notify } = useToast();
  const trapRef = useFocusTrap(true);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [type, setType] = useState<CardType>(card.type);
  const [formDirection, setFormDirection] = useState(0);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [tags, setTags] = useState<string[]>(card.tags ?? []);
  const [showBackCloze, setShowBackCloze] = useState(false);
  const [saving, setSaving] = useState(false);

  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);
  const draftTimer = useRef<number | undefined>(undefined);
  const draftKeyRef = useRef(draftKey(draftScope ?? card.schedulingUnitId!, `session:${card.id}`));

  // Auto-restore a draft from a previous interrupted session.
  useEffect(() => {
    const draft = loadDraft(draftKeyRef.current);
    if (draft && draft.timestamp > 0) {
      setType(draft.type);
      setFront(draft.front);
      setBack(draft.back);
      setTags(draft.tags);
    }
  }, []);

  // Auto-save a draft whenever the form changes.
  useEffect(() => {
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      saveDraft(draftKeyRef.current, {
        type,
        front,
        back,
        tags,
        timestamp: Date.now(),
      });
    }, 800);
    return () => window.clearTimeout(draftTimer.current);
  }, [type, front, back, tags]);

  /** Moves the type form the way the full editor does: forward or back along the picker order. */
  function changeType(next: CardType) {
    setFormDirection(Math.sign(EDITOR_TYPE_ORDER.indexOf(next) - EDITOR_TYPE_ORDER.indexOf(type)));
    setType(next);
  }

  const isCloze = type === 'cloze';
  const clozeValid = !isCloze || hasCloze(front);
  const frontValid = front.trim().length > 0;
  const backValid = isCloze || back.trim().length > 0;
  const canSave = frontValid && backValid && clozeValid && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const changes = { type, front, back: isCloze ? '' : back, tags };
    try {
      await updateCard(card.id, changes);
      // If this is a basic_reversed card, update its reverse partner too.
      if (card.type === 'basic_reversed' && card.reverseCardId) {
        await updateCard(card.reverseCardId, { front: back, back: front });
      }
      clearDraft(draftKeyRef.current);
      onSaved({ ...card, ...changes });
    } catch (err) {
      setSaving(false);
      notify(err instanceof Error ? err.message : 'Could not save the card.', 'negative');
    }
  }

  return (
    <DialogPanel
      label="Edit card"
      trapRef={trapRef}
      onBackdropClick={onCancel}
      className="max-h-[90vh] max-w-3xl"
      overlayClassName="pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] will-change-transform-opacity"
      onKeyDown={dialogKeyDown({ onCancel, onSubmit: () => void handleSave() })}
    >
      <DialogHeader title="Edit card" onClose={onCancel} closeLabel="Close editor" />

      <div className="flex flex-col gap-5 overflow-y-auto px-6 py-6">
        <PillToggleGroup<CardType>
          label="Card type"
          options={CARD_TYPE_OPTIONS}
          value={type}
          onChange={changeType}
        />

        <AnimatePresence initial={false}>
          <motion.div
            key={type}
            initial={m > 0 ? { opacity: 0, x: 16 * formDirection } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={scaledSpring(m, 380, 38)}
            className="flex flex-col gap-5"
          >
            {isCloze ? (
              <>
                <MarkdownEditor
                  inputRef={frontRef}
                  autoFocus
                  label="Text (use the Cloze button to hide answers)"
                  value={front}
                  onChange={setFront}
                  minRows={6}
                  allowCloze
                  clozePreview={showBackCloze ? 'back' : 'front'}
                  placeholder="The chemical symbol for water is {{c1::H2O}}."
                  onError={(message) => notify(message, 'negative')}
                />
                <Toggle
                  checked={showBackCloze}
                  onChange={setShowBackCloze}
                  label="Preview revealed answer"
                />
                {!clozeValid && front.trim().length > 0 && (
                  <p className="text-sm text-negative">
                    Add at least one cloze deletion using the Cloze button, e.g.{' '}
                    <code className="font-mono">{'{{c1::answer}}'}</code>.
                  </p>
                )}
              </>
            ) : (
              <>
                <MarkdownEditor
                  inputRef={frontRef}
                  autoFocus
                  label="Front"
                  value={front}
                  onChange={setFront}
                  minRows={6}
                  placeholder="Question or prompt"
                  onError={(message) => notify(message, 'negative')}
                  onTabForward={() => backRef.current?.focus()}
                />
                <MarkdownEditor
                  inputRef={backRef}
                  label="Back"
                  value={back}
                  onChange={setBack}
                  minRows={6}
                  placeholder="Answer"
                  onError={(message) => notify(message, 'negative')}
                  onTabBackward={() => frontRef.current?.focus()}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Tags */}
        <div>
          <div className="mb-2 text-sm text-ink-soft">Tags</div>
          <TagInput
            tags={tags}
            onChange={setTags}
            suggestions={tagSuggestions}
            placeholder="Add tags"
          />
        </div>
      </div>

      <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!canSave}
          title="Save (Ctrl/Cmd+Enter)"
        >
          Save changes
        </Button>
      </footer>
    </DialogPanel>
  );
}
