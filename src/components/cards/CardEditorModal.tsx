import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { useToast } from '../ui/Toast';
import { createCard, updateCard } from '../../db/repository';
import { hasCloze } from '../markdown/cloze';
import { cn } from '../ui/cn';
import type { Card, CardType } from '../../db/types';

interface CardEditorModalProps {
  open: boolean;
  deckId: string;
  /** When provided, the modal edits this card; otherwise it creates a new one. */
  card?: Card | null;
  onClose: () => void;
}

export function CardEditorModal({ open, deckId, card, onClose }: CardEditorModalProps) {
  const { notify } = useToast();
  const [type, setType] = useState<CardType>('front_back');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [showBackCloze, setShowBackCloze] = useState(false);

  // Reset the form whenever the modal opens or the target card changes.
  useEffect(() => {
    if (!open) return;
    setType(card?.type ?? 'front_back');
    setFront(card?.front ?? '');
    setBack(card?.back ?? '');
    setShowBackCloze(false);
  }, [open, card]);

  const isCloze = type === 'cloze';
  const clozeValid = !isCloze || hasCloze(front);
  const frontValid = front.trim().length > 0;
  const backValid = isCloze || back.trim().length > 0;
  const canSave = frontValid && backValid && clozeValid;

  async function handleSave() {
    if (!canSave) return;
    const backValue = isCloze ? '' : back;
    if (card) {
      await updateCard(card.id, { type, front, back: backValue });
      notify('Card updated.', 'positive');
    } else {
      await createCard(deckId, type, front, backValue);
      notify('Card added.', 'positive');
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={card ? 'Edit card' : 'New card'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            {card ? 'Save changes' : 'Add card'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Card type selector */}
        <div className="flex gap-2">
          {(['front_back', 'cloze'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors',
                type === t
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              {t === 'front_back' ? 'Front / Back' : 'Cloze deletion'}
            </button>
          ))}
        </div>

        {isCloze ? (
          <>
            <MarkdownEditor
              label="Text (use the Cloze button to hide answers)"
              value={front}
              onChange={setFront}
              allowCloze
              clozePreview={showBackCloze ? 'back' : 'front'}
              placeholder="The chemical symbol for water is {{c1::H2O}}."
              onError={(m) => notify(m, 'negative')}
            />
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={showBackCloze}
                onChange={(e) => setShowBackCloze(e.target.checked)}
                className="accent-accent"
              />
              Preview revealed answer
            </label>
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
              label="Front"
              value={front}
              onChange={setFront}
              placeholder="Question or prompt. Markdown, maths and images are supported."
              onError={(m) => notify(m, 'negative')}
            />
            <MarkdownEditor
              label="Back"
              value={back}
              onChange={setBack}
              placeholder="Answer. Markdown, maths and images are supported."
              onError={(m) => notify(m, 'negative')}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
