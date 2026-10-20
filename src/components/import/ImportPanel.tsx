import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useEditorKeys } from '../../hooks/dialogKeys';
import { CardImportDialog } from './CardImportDialog';
import { SharedCourseImport } from './SharedCourseImport';
import { ImportDestination, useImportDestination } from './ImportDestination';
import { importCardsToDestination } from '../../db/cardImport';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { StepSwap } from '../ui/StepSwap';
import { expandingActionSpring } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { UploadIcon, CardsIcon, FileTextIcon, ShareIcon, ChevronLeftIcon } from '../ui/icons';
import './ImportPanel.css';
import { Field, Input } from '../ui/Field';
import { normaliseShortClassCode } from '../../insights/classCode';
import { countOf } from '../../utils/plural';

type Source = 'class' | 'lacuna' | 'anki' | 'text';
const sources = [
  { id: 'lacuna', title: 'Lacuna course', detail: 'File, link, code or QR', icon: ShareIcon },
  { id: 'anki', title: 'Anki deck', detail: 'Anki package (.apkg)', icon: CardsIcon },
  { id: 'text', title: 'Text or spreadsheet', detail: 'Paste or upload cards', icon: FileTextIcon },
  {
    id: 'class',
    title: 'Join a class',
    detail: 'Enter your teacher’s class code',
    icon: ShareIcon,
  },
] as const;

export function ImportPanel({
  onClose,
  onBusyChange,
}: {
  onClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const [params] = useSearchParams();
  const [source, setSource] = useState<Source | null>(() => (params.has('join') ? 'class' : null));
  const [classCode, setClassCode] = useState('');
  const [classError, setClassError] = useState<string | null>(null);
  const [file, setFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const pageRoot = useRef<HTMLDivElement>(null);
  const stepContent = useRef<HTMLDivElement>(null);
  const [stepHeight, setStepHeight] = useState<number>();
  const sourceButtons = useRef<Partial<Record<Source, HTMLButtonElement | null>>>({});
  const returnSource = useRef<Source | null>(params.has('join') ? 'class' : null);
  const navigate = useNavigate();
  const { notify } = useToast();
  const draft = useImportDestination();

  useLayoutEffect(() => {
    const content = stepContent.current;
    if (!content) return;
    // Measure the incoming step in flow; departing StepSwap surfaces are absolute.
    const measure = () => setStepHeight(content.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [source]);

  useLayoutEffect(() => {
    if (source) {
      // A fast return can revive an exiting form, so mount-only autofocus is insufficient.
      const focusInput = () => {
        const selector =
          source === 'class'
            ? '#join-class-code'
            : source === 'lacuna'
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
  const keys = useEditorKeys({
    onCancel: () => {
      if (!busy) {
        if (source) reset();
        else onClose?.();
      }
    },
  });

  return (
    <div
      ref={pageRoot}
      className="import-panel"
      style={{ '--import-motion-duration': `${200 * multiplier}ms` } as CSSProperties}
      {...keys}
    >
      <motion.div
        initial={false}
        animate={{ height: multiplier > 0 ? (stepHeight ?? 'auto') : 'auto' }}
        transition={expandingActionSpring(multiplier)}
        className="import-step-height"
      >
        <div ref={stepContent}>
          <StepSwap stepKey={source ?? 'sources'} direction={source ? 1 : -1}>
            <>
              <header className={source ? 'mb-3 flex items-center justify-end' : 'sr-only'}>
                <h2 className="sr-only">Import</h2>
                {source && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Back to import sources"
                    onClick={reset}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
                  >
                    <ChevronLeftIcon width={16} height={16} />
                    All sources
                  </button>
                )}
              </header>
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
                      if (!event.currentTarget.contains(event.relatedTarget as Node))
                        setDragging(false);
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
              ) : source === 'class' ? (
                <form
                  className="space-y-4 p-5"
                  aria-label="Join a class"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const code = normaliseShortClassCode(classCode);
                    if (!code) {
                      setClassError('Enter the eight-character class code from your teacher.');
                      return;
                    }
                    void navigate(`/s/${code}`);
                  }}
                >
                  <h2 className="font-display text-xl">Join a class</h2>
                  <Field label="Class code" error={classError ?? undefined}>
                    <Input
                      id="join-class-code"
                      autoFocus
                      autoComplete="off"
                      spellCheck={false}
                      value={classCode}
                      onChange={(event) => {
                        setClassCode(event.target.value);
                        setClassError(null);
                      }}
                      placeholder="ABCD-1234"
                      className="font-mono text-xl"
                    />
                  </Field>
                  <p className="text-sm text-ink-soft">
                    Your teacher gives you this code. Preview the course, then choose whether to
                    share insights with your teacher.
                  </p>
                  <Button type="submit" variant="primary">
                    Join class
                  </Button>
                </form>
              ) : source === 'lacuna' ? (
                <SharedCourseImport
                  onBusyChange={setBusy}
                  initialFile={file}
                  onImported={(id) => void navigate(`/course/${id}`)}
                />
              ) : (
                <CardImportDialog
                  presentation="panel"
                  initialFile={file}
                  // Pasted text outlives a trip back to All sources.
                  initialText={source === 'text' && !file ? pastedText : undefined}
                  onTextChange={source === 'text' ? setPastedText : undefined}
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
                    if (!draft.destination)
                      throw new Error('Choose a destination and study target.');
                    const result = await importCardsToDestination(draft.destination, content);
                    notify(`${countOf(result.count, 'card')} imported.`, 'positive');
                    void navigate(
                      `/course/${result.courseId}${result.lesson ? `/lesson/${result.lesson.id}` : ''}`,
                    );
                  }}
                />
              )}
            </>
          </StepSwap>
        </div>
      </motion.div>
    </div>
  );
}
