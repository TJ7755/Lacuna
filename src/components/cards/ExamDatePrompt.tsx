import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { updateDeck } from '../../db/repository';
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../utils/datetime';
import type { Deck } from '../../db/types';

interface ExamDatePromptProps {
  open: boolean;
  deck: Deck;
  /** Called once the prompt is resolved (either way) so the caller can proceed to study. */
  onResolved: () => void;
}

/**
 * Shown the first time a deck is studied. Lets the user confirm the real exam date and
 * time (pre-filled with the seven-day default). Dismissing keeps the default and the
 * prompt returns next time, unless "Don't ask again" is enabled.
 */
export function ExamDatePrompt({ open, deck, onResolved }: ExamDatePromptProps) {
  const [value, setValue] = useState(() => toDateTimeLocalValue(deck.examDate));
  const [dontAsk, setDontAsk] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(toDateTimeLocalValue(deck.examDate));
      setDontAsk(false);
    }
  }, [open, deck.examDate]);

  async function handleSave() {
    const ms = fromDateTimeLocalValue(value);
    await updateDeck(deck.id, {
      examDate: Number.isNaN(ms) ? deck.examDate : ms,
      examDatePromptDismissed: true,
    });
    onResolved();
  }

  async function handleDismiss() {
    if (dontAsk) {
      await updateDeck(deck.id, { examDatePromptDismissed: true });
    }
    onResolved();
  }

  return (
    <Modal
      open={open}
      onClose={handleDismiss}
      title="When is your exam?"
      footer={
        <>
          <Button variant="ghost" onClick={handleDismiss}>
            Not now
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Set date
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-soft">
        Lacuna schedules every card to peak on your exam day. Set the real date and time
        so the queue and progress bar are accurate.
      </p>
      <label className="block text-sm text-ink-soft">
        Exam date and time
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
      </label>
      <div className="mt-4">
        <Toggle
          checked={dontAsk}
          onChange={setDontAsk}
          label="Don't ask again for this deck"
        />
      </div>
    </Modal>
  );
}
