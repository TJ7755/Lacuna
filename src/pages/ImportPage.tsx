import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorKeys } from '../hooks/dialogKeys';
import { CardImportDialog } from '../components/import/CardImportDialog';
import { SharedCourseImport } from '../components/import/SharedCourseImport';
import { ImportDestination, useImportDestination } from '../components/import/ImportDestination';
import { importCardsToDestination } from '../db/cardImport';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { StepSwap } from '../components/ui/StepSwap';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import {
  UploadIcon,
  CardsIcon,
  FileTextIcon,
  ShareIcon,
  ChevronLeftIcon,
} from '../components/ui/icons';
import './ImportPage.css';

type Source = 'lacuna' | 'anki' | 'text';
const sources = [
  { id: 'lacuna', title: 'Lacuna course', detail: 'File, link, code or QR', icon: ShareIcon },
  { id: 'anki', title: 'Anki deck', detail: 'Anki package (.apkg)', icon: CardsIcon },
  { id: 'text', title: 'Text or spreadsheet', detail: 'Paste or upload cards', icon: FileTextIcon },
] as const;

export function ImportPage() {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [file, setFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pageRoot = useRef<HTMLDivElement>(null);
  const sourceButtons = useRef<Partial<Record<Source, HTMLButtonElement | null>>>({});
  const returnSource = useRef<Source | null>(null);
  const navigate = useNavigate();
  const { notify } = useToast();
  const draft = useImportDestination();

  useLayoutEffect(() => {
    if (source) {
      // A fast return can revive an exiting form, so mount-only autofocus is insufficient.
      const focusInput = () => {
        const selector =
          source === 'lacuna'
            ? 'textarea[aria-label="Share link or code to import"]'
            : source === 'anki'
              ? '.card-import-package button'
              : '#card-import-text';
        const target = [...(pageRoot.current?.querySelectorAll<HTMLElement>(selector) ?? [])].find(
          (element) => !element.closest('[inert]'),
        );
        target?.focus({ preventScroll: true });
      };
      if (multiplier === 0) {
        focusInput();
        return;
      }
      const frame = requestAnimationFrame(focusInput);
      return () => cancelAnimationFrame(frame);
    }
    if (!returnSource.current) return;
    sourceButtons.current[returnSource.current]?.focus({ preventScroll: true });
    returnSource.current = null;
  }, [source, multiplier]);

  function chooseFile(next: File | undefined) {
    if (!next) return;
    setFile(next);
    const nextSource = /\.lacuna$/i.test(next.name)
      ? 'lacuna'
      : /\.apkg$/i.test(next.name)
        ? 'anki'
        : 'text';
    returnSource.current = nextSource;
    setSource(nextSource);
  }
  function reset() {
    setSource(null);
    setFile(undefined);
  }
  // Escape returns to the source list while nothing has been entered; the card import form
  // claims its own keys first.
  const keys = useEditorKeys({ onCancel: () => source && !busy && reset() });

  return (
    <div
      ref={pageRoot}
      className={`import-page ${PAGE_FRAME} py-10`}
      style={{ '--import-motion-duration': `${200 * multiplier}ms` } as CSSProperties}
      {...keys}
    >
      {/* The title keeps the same place as every other page; Back joins its row. */}
      <header className="mb-8 flex min-h-11 flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          Import
        </h1>
        {source && (
          <button
            type="button"
            disabled={busy}
            aria-label="Back to import sources"
            onClick={reset}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink active:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeftIcon width={16} height={16} />
            Back
          </button>
        )}
      </header>
      <StepSwap stepKey={source ?? 'sources'}>
        {!source ? (
          <>
            <div className="import-sources">
              {sources.map(({ id, title, detail, icon: Icon }, index) => (
                <button
                  key={id}
                  type="button"
                  autoFocus={index === 0}
                  ref={(button) => {
                    sourceButtons.current[id] = button;
                  }}
                  onClick={() => {
                    returnSource.current = id;
                    setSource(id);
                  }}
                >
                  <Icon width={24} height={24} />
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </button>
              ))}
            </div>
            <div
              className="import-drop"
              data-dragging={dragging}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                chooseFile(event.dataTransfer.files[0]);
              }}
            >
              <UploadIcon width={28} height={28} />
              <h2>Drop a file here</h2>
              <p>Lacuna, Anki, CSV, TSV, Markdown, JSON or text</p>
              <input
                ref={input}
                type="file"
                hidden
                aria-label="Import file"
                accept=".lacuna,.apkg,.csv,.tsv,.txt,.json,.md,.markdown"
                onChange={(event) => {
                  chooseFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <Button variant="primary" onClick={() => input.current?.click()}>
                Choose file
              </Button>
            </div>
          </>
        ) : source === 'lacuna' ? (
          <SharedCourseImport
            onBusyChange={setBusy}
            initialFile={file}
            onImported={(id) => void navigate(`/course/${id}`)}
          />
        ) : (
          <CardImportDialog
            presentation="page"
            initialFile={file}
            preferPackage={source === 'anki'}
            onBusyChange={setBusy}
            onCancel={reset}
            schedulingUnitId={
              draft.destination?.kind === 'existing'
                ? draft.destination.schedulingUnitId
                : undefined
            }
            reviewOptions={<ImportDestination draft={draft} />}
            canImport={!!draft.destination}
            onImport={async (content) => {
              if (!draft.destination) throw new Error('Choose a destination and study target.');
              const result = await importCardsToDestination(draft.destination, content);
              notify(`${result.count} cards imported.`, 'positive');
              void navigate(
                `/course/${result.courseId}${result.lesson ? `/lesson/${result.lesson.id}` : ''}`,
              );
            }}
          />
        )}
      </StepSwap>
    </div>
  );
}
