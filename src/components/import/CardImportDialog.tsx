import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { checkDuplicatesBatch } from '../../db/cardRepository';
import {
  canReverseImportCard,
  importCardCount,
  MAX_IMPORT_CARDS,
  type CardImportContent,
} from '../../db/cardImport';
import { CloseIcon } from '../ui/icons';
import { Button } from '../ui/Button';
import { StepSwap } from '../ui/StepSwap';
import { useCardImportSource } from './useCardImportSource';
import { CardImportInput } from './CardImportInput';
import { CardImportPreview } from './CardImportPreview';
import './CardImportDialog.css';

export interface CardImportDialogProps {
  initialTitle?: string;
  /** Omit for an existing destination, whose name is shown without renaming it. */
  titleLabel?: 'Course title' | 'Lesson title';
  targetName?: string;
  schedulingUnitId?: string;
  onCancel: () => void;
  onImport: (content: CardImportContent, title: string) => Promise<void>;
}

export function CardImportDialog({
  initialTitle = '',
  titleLabel,
  targetName,
  schedulingUnitId,
  onCancel,
  onImport,
}: CardImportDialogProps) {
  const source = useCardImportSource();
  const [title, setTitle] = useState(initialTitle);
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [reverse, setReverse] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<number | null>(null);
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const trapRef = useFocusTrap(true, {
    autoFocusSelector: titleLabel ? '#card-import-title' : '#card-import-text',
  });
  const cards = source.apkg?.cards ?? source.result.cards;
  const content: CardImportContent = source.apkg
    ? { kind: 'apkg', result: source.apkg }
    : { kind: 'text', cards, reverse };
  const count = importCardCount(content);
  const eligible = source.apkg ? 0 : cards.filter(canReverseImportCard).length;
  const candidates = useMemo(
    () =>
      reverse && !source.apkg
        ? [
            ...cards,
            ...cards
              .filter(canReverseImportCard)
              .map((card) => ({ ...card, front: card.back, back: card.front })),
          ]
        : cards,
    [cards, reverse, source.apkg],
  );
  useEffect(() => {
    if (!schedulingUnitId || !candidates.length) {
      setDuplicates(null);
      return;
    }
    let stale = false;
    setDuplicates(null);
    void checkDuplicatesBatch(schedulingUnitId, candidates)
      .then((result) => {
        if (!stale) setDuplicates(result.size);
      })
      .catch(() => {
        if (!stale) setDuplicates(null);
      });
    return () => {
      stale = true;
    };
  }, [schedulingUnitId, candidates]);
  const limitError =
    count > MAX_IMPORT_CARDS
      ? `This would create ${count.toLocaleString()} cards. Use at most ${MAX_IMPORT_CARDS.toLocaleString()} per import.`
      : '';
  const sourceError =
    source.detected === 'share-code' && !source.apkg
      ? 'Import shared courses using New course → Import share code.'
      : source.error;
  const canContinue =
    count > 0 && !limitError && !sourceError && !source.reading && (!titleLabel || !!title.trim());
  function cancel() {
    if (!busyRef.current) onCancel();
  }
  async function confirm() {
    if (!canContinue || busyRef.current) return;
    if (step === 'input') {
      setError('');
      setStep('review');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await onImport(content, title.trim());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not import cards. Your input has been kept.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return createPortal(
    <div
      ref={trapRef}
      className="card-import-overlay"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.preventDefault();
          cancel();
        }
      }}
    >
      <div className="card-import-backdrop" aria-hidden="true" />
      <motion.section
        className="card-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-import-heading"
        aria-busy={busy || source.reading}
        initial={m ? { opacity: 0, y: 18 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', duration: 0.4 * m, bounce: 0 }}
      >
        <header className="card-import-header">
          <h2 id="card-import-heading">Import cards</h2>
          <ol className="card-import-steps" aria-label="Import progress">
            <li aria-current={step === 'input' ? 'step' : undefined}>
              <b>1</b> Add content
            </li>
            <li aria-current={step === 'review' ? 'step' : undefined}>
              <b>2</b> Review cards
            </li>
          </ol>
          <button type="button" aria-label="Close import" onClick={cancel} disabled={busy}>
            <CloseIcon width={18} height={18} />
          </button>
        </header>
        <div className="card-import-scroll">
          <StepSwap stepKey={step} direction={step === 'review' ? 1 : -1} moveFocus>
            <div className="card-import-body">
              <div className="card-import-options">
                <h2 tabIndex={-1}>{step === 'input' ? 'Add content' : 'Review cards'}</h2>
                {titleLabel ? (
                  <label className="card-import-title-label" htmlFor="card-import-title">
                    {titleLabel}
                    <input
                      id="card-import-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                ) : (
                  <div className="card-import-destination">
                    <span>Adding to</span>
                    <strong>{targetName}</strong>
                  </div>
                )}
                {step === 'review' && (
                  <>
                    {!source.apkg && (
                      <label className="card-import-reverse">
                        <span>Also create reverse</span>
                        <input
                          type="checkbox"
                          checked={reverse}
                          onChange={(event) => setReverse(event.target.checked)}
                          disabled={busy || !eligible}
                        />
                        <span className="card-import-switch" aria-hidden="true" />
                      </label>
                    )}
                    <div className="card-import-total">
                      <strong>{count}</strong>
                      <span>
                        cards
                        {!source.apkg && (
                          <small>
                            {cards.length} original · {reverse ? eligible : 0} reverse
                          </small>
                        )}
                      </span>
                    </div>
                    {!!duplicates && (
                      <p className="card-import-notice">
                        {duplicates} already exist. Importing will add copies.
                      </p>
                    )}
                    {source.apkg && (
                      <p className="card-import-notice">Anki scheduling and media are preserved.</p>
                    )}
                    {(source.apkg?.skippedCards ?? source.result.skipped) > 0 && (
                      <p className="card-import-notice">
                        {source.apkg?.skippedCards ?? source.result.skipped}{' '}
                        {source.apkg ? 'unsupported cards' : 'rows'} skipped.
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="card-import-content">
                {step === 'input' ? (
                  <CardImportInput source={source} />
                ) : (
                  <CardImportPreview
                    cards={cards}
                    reverse={reverse && !source.apkg}
                    media={source.apkg?.media}
                  />
                )}
              </div>
            </div>
          </StepSwap>
        </div>
        <footer className="card-import-footer">
          <div className="card-import-feedback">
            {(error || sourceError || limitError) && (
              <p role="alert">{error || sourceError || limitError}</p>
            )}
          </div>
          <div className="card-import-actions">
            {step === 'review' ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setError('');
                  setStep('input');
                }}
              >
                Undo
              </Button>
            ) : (
              <Button variant="ghost" disabled={busy} onClick={cancel}>
                Cancel
              </Button>
            )}
            <span>
              {step === 'input'
                ? 'Step 1 of 2'
                : `${cards.length} original${!source.apkg && reverse ? ` + ${eligible} reverse` : ''}`}
            </span>
            <Button
              variant="primary"
              disabled={!canContinue || busy}
              onClick={() => void confirm()}
            >
              {busy ? 'Importing…' : step === 'input' ? 'Review cards' : `Import ${count} cards`}
              <span aria-hidden="true">→</span>
            </Button>
          </div>
        </footer>
      </motion.section>
    </div>,
    document.body,
  );
}
