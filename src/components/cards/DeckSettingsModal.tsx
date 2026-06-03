import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { deleteDeck, updateDeck } from '../../db/repository';
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../utils/datetime';
import type { Deck, ExamObjective } from '../../db/types';

interface DeckSettingsModalProps {
  open: boolean;
  deck: Deck;
  onClose: () => void;
}

export function DeckSettingsModal({ open, deck, onClose }: DeckSettingsModalProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(deck.name);
  const [examValue, setExamValue] = useState(toDateTimeLocalValue(deck.examDate));
  const [objective, setObjective] = useState<ExamObjective>(deck.examObjective);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setName(deck.name);
      setExamValue(toDateTimeLocalValue(deck.examDate));
      setObjective(deck.examObjective);
    }
  }, [open, deck.name, deck.examDate, deck.examObjective]);

  async function handleSave() {
    const ms = fromDateTimeLocalValue(examValue);
    await updateDeck(deck.id, {
      name: name.trim() || deck.name,
      examDate: Number.isNaN(ms) ? deck.examDate : ms,
      examObjective: objective,
    });
    notify('Deck updated.', 'positive');
    onClose();
  }

  async function handleDelete() {
    await deleteDeck(deck.id);
    notify('Deck deleted.');
    navigate('/');
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Deck settings"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="block text-sm text-ink-soft">
            Deck name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="block text-sm text-ink-soft">
            Exam date and time
            <input
              type="datetime-local"
              value={examValue}
              onChange={(e) => setExamValue(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="block text-sm text-ink-soft">
            <div className="mb-2">Exam objective</div>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-ink-faint">
                {objective === 'securedTopics'
                  ? 'Secure as many topics as possible: prioritise cards a review would push to 90%+ on exam day. The progress bar shows the fraction of cards secured.'
                  : 'Maximise your expected marks: prioritise the largest expected lift to exam-day retrievability. The progress bar shows your mean predicted retrievability.'}
              </p>
              <Toggle
                checked={objective === 'securedTopics'}
                onChange={(checked) =>
                  setObjective(checked ? 'securedTopics' : 'expectedMarks')
                }
                label="Secure topics"
              />
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-negative/30 bg-negative/5 p-4">
            <div className="mb-1 text-sm font-medium text-negative">Danger zone</div>
            <p className="mb-3 text-sm text-ink-soft">
              Deleting this deck removes all of its cards and history permanently.
            </p>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete deck
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete deck"
        message={`Permanently delete "${deck.name}" and all its cards? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
