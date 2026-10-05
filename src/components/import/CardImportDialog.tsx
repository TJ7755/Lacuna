import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { dialogKeyDown, useEditorKeys } from '../../hooks/dialogKeys';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { checkDuplicatesBatch } from '../../db/cardRepository';
import {
  canReverseImportCard,
  importCardCount,
  MAX_IMPORT_CARDS,
  type CardImportContent,
} from '../../db/cardImport';
import { ChevronLeftIcon, CloseIcon } from '../ui/icons';
import { Button } from '../ui/Button';
import { StepSwap } from '../ui/StepSwap';
import { CountUp } from '../ui/Celebration';
import { ImportStepper } from './ImportStepper';
import { useCardImportSource } from './useCardImportSource';
import { CardImportInput } from './CardImportInput';
import { CardImportPreview } from './CardImportPreview';
import './CardImportDialog.css';

export interface CardImportDialogProps {
  initialTitle?: string;
  presentation?: 'dialog' | 'page';
  initialFile?: File;
  reviewOptions?: ReactNode;
  canImport?: boolean;
  preferPackage?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** Omit for an existing destination, whose name is shown without renaming it. */
  titleLabel?: 'Course title' | 'Lesson title';
  targetName?: string;
  schedulingUnitId?: string;
  onCancel: () => void;
  onImport: (content: CardImportContent, title: string) => Promise<void>;
}

export function CardImportDialog({
  initialTitle = '',
  presentation = 'dialog',
  initialFile,
  reviewOptions,
  canImport = true,
  preferPackage = false,
  onBusyChange,
  titleLabel,
  targetName,
  schedulingUnitId,
  onCancel,
  onImport,
}: CardImportDialogProps) {
  const source = useCardImportSource();
  const loadedFile = useRef<File | undefined>(undefined);
  useEffect(() => {
    if (initialFile && loadedFile.current !== initialFile) {
      loadedFile.current = initialFile;
      void source.readFile(initialFile);
    }
  }, [initialFile, source]);
  const [title, setTitle] = useState(initialTitle);
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [reverse, setReverse] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<number | null>(null);
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const trapRef = useFocusTrap(presentation === 'dialog', {
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
      ? 'Import shared courses from Import → Lacuna course.'
      : source.error;
  const canContinue =
    count > 0 && !limitError && !sourceError && !source.reading && (!titleLabel || !!title.trim());
  function cancel() {
    if (!busyRef.current) onCancel();
  }
  async function confirm() {
    if (!canContinue || busyRef.current || (step === 'review' && !canImport)) return;
    if (step === 'input') {
      setError('');
      setStep('review');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    onBusyChange?.(true);
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
      onBusyChange?.(false);
    }
  }
  const primaryRef = useRef<HTMLButtonElement>(null);
  // As a dialog it owns the keyboard (Escape cancels, Ctrl/Cmd+Enter continues or imports);
  // as a page it leaves keys to the shell and only cancels while nothing has been entered.
  const dialogKeys = dialogKeyDown({ onCancel: cancel, onSubmit: () => void confirm() });
  const pageKeys = useEditorKeys({ onCancel: cancel, onSubmit: () => void confirm() });
  useEffect(() => {
    if (presentation !== 'page') return;
    trapRef.current
      ?.querySelector<HTMLElement>(titleLabel ? '#card-import-title' : '#card-import-text')
      ?.focus();
    // Only on first show: later focus belongs to the person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const view = (
    <div
      ref={trapRef}
      className={presentation === 'dialog' ? 'card-import-overlay' : 'card-import-page'}
      onInput={presentation === 'page' ? pageKeys.onInput : undefined}
      onClick={presentation === 'page' ? pageKeys.onClick : undefined}
      onKeyDown={(event) => {
        // Pasted data does not need Tab, so the last field hands focus to the primary action.
        if (
          event.key === 'Tab' &&
          !event.shiftKey &&
          (event.target as Element).id === 'card-import-text' &&
          canContinue
        ) {
          event.preventDefault();
          primaryRef.current?.focus();
        }
        (presentation === 'dialog' ? dialogKeys : pageKeys.onKeyDown)(event);
      }}
    >
      {presentation === 'dialog' && <div className="card-import-backdrop" aria-hidden="true" />}
      <motion.section
        className="card-import-dialog"
        role={presentation === 'dialog' ? 'dialog' : undefined}
        aria-modal={presentation === 'dialog' ? true : undefined}
        aria-labelledby="card-import-heading"
        aria-busy={busy || source.reading}
        initial={m ? { opacity: 0, y: 18 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', duration: 0.4 * m, bounce: 0 }}
      >
        <header className="card-import-header">
          {/* On the Import page, the page's own title and Back link already do these jobs. */}
          <h2 id="card-import-heading" className={presentation === 'page' ? 'sr-only' : undefined}>
            Import cards
          </h2>
          <ImportStepper step={step} />
          {presentation === 'dialog' && (
            <button type="button" aria-label="Close import" onClick={cancel} disabled={busy}>
              <CloseIcon width={18} height={18} />
            </button>
          )}
        </header>
        <div className="card-import-scroll">
          <StepSwap stepKey={step} direction={step === 'review' ? 1 : -1} moveFocus>
            <div className="card-import-body">
              <div className="card-import-options">
                {/* The stepper shows the step; this heading stays as the focus target. */}
                <h2 tabIndex={-1} className="sr-only">
                  {step === 'input' ? 'Add content' : 'Review cards'}
                </h2>
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
                ) : targetName ? (
                  <div className="card-import-destination">
                    <span>Adding to</span>
                    <strong>{targetName}</strong>
                  </div>
                ) : null}
                {step === 'review' && reviewOptions && (
                  <fieldset disabled={busy}>{reviewOptions}</fieldset>
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
                      <strong>
                        <CountUp value={count} multiplier={m} duration={0.7} />
                      </strong>
                      <span>
                        cards
                        {!source.apkg && (
                          <small>
                            {cards.length} original · {reverse ? eligible : 0} reverse
                          </small>
                        )}
                      </span>
                    </div>
                    <div className="card-import-notices">
                      {!!duplicates && (
                        <p className="card-import-notice" data-tone="warning">
                          {duplicates} already exist. Importing will add copies.
                        </p>
                      )}
                      {source.apkg && (
                        <p className="card-import-notice">
                          Anki scheduling and media are preserved.
                        </p>
                      )}
                      {(source.apkg?.skippedCards ?? source.result.skipped) > 0 && (
                        <p className="card-import-notice">
                          {source.apkg?.skippedCards ?? source.result.skipped}{' '}
                          {source.apkg ? 'unsupported cards' : 'rows'} skipped.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="card-import-content">
                {step === 'input' ? (
                  <CardImportInput source={source} preferPackage={preferPackage} />
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
                <ChevronLeftIcon width={16} height={16} />
                Back
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
              ref={primaryRef}
              variant="primary"
              disabled={!canContinue || busy || (step === 'review' && !canImport)}
              onClick={() => void confirm()}
            >
              {busy ? 'Importing…' : step === 'input' ? 'Review cards' : `Import ${count} cards`}
              <span aria-hidden="true">→</span>
            </Button>
          </div>
        </footer>
      </motion.section>
    </div>
  );
  return presentation === 'dialog' ? createPortal(view, document.body) : view;
}
