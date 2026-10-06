import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import QRCode from 'react-qr-code';
import { referencedAssetHashes } from '../../db/assets';
import { publishCourse } from '../../db/courseRepository';
import { exportCardsSimple } from '../../db/export';
import { buildCourseShareCode, buildCourseShareCodeQR } from '../../db/share';
import type { Card, Course } from '../../db/types';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { formatRelativeTime } from '../../utils/datetime';
import { CourseFileExportButton } from '../import/CourseFileControls';
import { Button } from '../ui/Button';
import { DownloadIcon, FileTextIcon, QrCodeIcon, ShareIcon } from '../ui/icons';
import { collapse, motionTransition } from '../ui/motion';
import { SectionCard } from '../ui/SectionCard';
import { useToast } from '../ui/Toast';
import { CopyButton } from './CopyButton';
import { useActionFocus } from '../../hooks/useActionFocus';

/** Maximum characters a single QR code (version 40, L error correction) can hold in Alphanumeric mode. */
const MAX_QR_ALPHANUMERIC_CHARS = 4296;

type Way = 'file' | 'code' | 'qr' | 'text';

const WAYS: Array<{ id: Way; label: string; icon: ReactNode }> = [
  { id: 'file', label: 'Course file', icon: <DownloadIcon width={16} height={16} /> },
  { id: 'code', label: 'Share code', icon: <ShareIcon width={16} height={16} /> },
  { id: 'qr', label: 'QR code', icon: <QrCodeIcon width={16} height={16} /> },
  { id: 'text', label: 'Plain text', icon: <FileTextIcon width={16} height={16} /> },
];

function mediaCardLabel(card: Card, index: number): string {
  const firstTextLine = card.front
    .replace(/!\[[^\]]*\]\(lacuna-asset:\/\/[a-f0-9]{64}\)/gi, '')
    .replace(/lacuna-asset:\/\/[a-f0-9]{64}/gi, '')
    .split('\n')
    .map((line) => line.replace(/^[#>*_\s-]+|[*_\s]+$/g, '').trim())
    .find(Boolean);
  if (!firstTextLine) return `Card ${index + 1} (no text prompt)`;
  return firstTextLine.length > 80 ? `${firstTextLine.slice(0, 77)}…` : firstTextLine;
}

/** A read-only generated output with its Copy button. */
function Output({
  label,
  value,
  rows,
  inputRef,
}: {
  label: string;
  value: string;
  rows: number;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);
  const timeout = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timeout.current) window.clearTimeout(timeout.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timeout.current) window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('Copy failed. Select the text and copy it manually.', 'negative');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={inputRef}
        readOnly
        aria-label={label}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        rows={rows}
        className="w-full resize-none break-all rounded-2xl bg-paper px-4 py-3 font-mono text-xs text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      />
      <div>
        <CopyButton copied={copied} onClick={() => void copy()} />
      </div>
    </div>
  );
}

/**
 * The share link's alternatives: a course file, a text code, a QR code and plain
 * text. One opens at a time; generated outputs survive switching between them.
 * Keyed by course, so another course starts afresh.
 */
export function OtherShareWays({ course, cards }: { course: Course; cards: Card[] | undefined }) {
  const { notify } = useToast();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const titleId = useId();
  const [way, setWay] = useState<Way | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [code, setCode] = useState('');
  const [qr, setQr] = useState('');
  const [text, setText] = useState('');
  const mounted = useRef(true);
  const actionFocus = useActionFocus();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Two ways a card carries media a code cannot: an asset embed in its Markdown
  // (images, audio), and an occlusion diagram, which lives on `Occlusion.assetHash`
  // and so never appears in the card's text at all. Occlusion cards degrade to
  // their plain-text fallback for the recipient rather than breaking, but they are
  // still not the card the author made (Arc 6 §6.6).
  const mediaCards = useMemo(
    () =>
      (cards ?? []).filter(
        (card) =>
          card.occlusionRegionId !== undefined ||
          referencedAssetHashes(`${card.front}\n${card.back}`).length > 0,
      ),
    [cards],
  );

  async function run<T>(task: () => Promise<T>, fallback: string): Promise<T | undefined> {
    actionFocus.remember();
    setBusy(true);
    try {
      const result = await task();
      return mounted.current ? result : undefined;
    } catch (error) {
      if (mounted.current) notify(error instanceof Error ? error.message : fallback, 'negative');
      return undefined;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function createCode() {
    const result = await run(
      () => buildCourseShareCode(course.id),
      'Could not generate a share code.',
    );
    if (result !== undefined) setCode(result);
  }

  async function createQr() {
    const result = await run(
      () => buildCourseShareCodeQR(course.id),
      'Could not generate a QR code.',
    );
    if (result === undefined) return;
    if (result.length > MAX_QR_ALPHANUMERIC_CHARS) {
      notify(
        'This course is too large for a single QR code. Use the share code instead.',
        'negative',
      );
      return;
    }
    setQr(result);
  }

  function createText() {
    actionFocus.remember();
    if (!cards?.length) {
      notify('This course has no cards to export.', 'negative');
      return;
    }
    setText(exportCardsSimple(cards));
  }

  async function publish() {
    setPublishing(true);
    try {
      await publishCourse(course.id);
      if (!mounted.current) return;
      // Keep an already-generated code in step with the new revision rather than
      // leaving a stale pre-publish code on screen.
      if (code) {
        const refreshed = await buildCourseShareCode(course.id);
        if (mounted.current) setCode(refreshed);
      }
    } catch (error) {
      if (mounted.current)
        notify(
          error instanceof Error ? error.message : 'Could not publish this course.',
          'negative',
        );
    } finally {
      if (mounted.current) setPublishing(false);
    }
  }

  const mediaNote = mediaCards.length > 0 && (
    <details className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm text-ink-soft">
      <summary className="cursor-pointer">
        Media in {mediaCards.length} {mediaCards.length === 1 ? 'card' : 'cards'} won&apos;t be
        included. A course file or the share link keeps it.
      </summary>
      <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-ink-faint">
        {mediaCards.map((card, index) => (
          <li key={`${card.id}-${index}`}>{mediaCardLabel(card, index)}</li>
        ))}
      </ul>
    </details>
  );

  const publishRow = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <p className="text-sm text-ink-faint">
        {course.distribution
          ? `Revision ${course.distribution.revision} · published ${formatRelativeTime(course.distribution.publishedAt)}`
          : 'Unpublished copies won’t receive your later edits.'}
      </p>
      <Button
        size="sm"
        variant={course.distribution ? 'ghost' : 'secondary'}
        onClick={() => void publish()}
        disabled={publishing}
      >
        {publishing ? 'Publishing…' : course.distribution ? 'Publish update' : 'Publish course'}
      </Button>
    </div>
  );

  function panel(id: Way) {
    switch (id) {
      case 'file':
        return (
          <>
            <CourseFileExportButton courseId={course.id} name={course.name} />
            {publishRow}
          </>
        );
      case 'code':
        return (
          <>
            {code ? (
              <Output
                inputRef={actionFocus.restore}
                label="Generated share code"
                value={code}
                rows={4}
              />
            ) : (
              <Button variant="primary" onClick={() => void createCode()} disabled={busy}>
                {busy ? 'Creating…' : 'Create share code'}
              </Button>
            )}
            {mediaNote}
            {publishRow}
          </>
        );
      case 'qr':
        return (
          <>
            {qr ? (
              <div className="flex flex-col items-start gap-3">
                <motion.div
                  initial={m > 0 ? { scale: 0.85, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={motionTransition('local', m, 'emphasised')}
                  className="rounded-2xl bg-white p-4"
                >
                  <QRCode value={qr} size={224} level="L" bgColor="#ffffff" fgColor="#000000" />
                </motion.div>
                <Output inputRef={actionFocus.restore} label="QR code text" value={qr} rows={2} />
              </div>
            ) : (
              <Button variant="primary" onClick={() => void createQr()} disabled={busy}>
                {busy ? 'Creating…' : 'Create QR code'}
              </Button>
            )}
            {mediaNote}
            {publishRow}
          </>
        );
      case 'text':
        return (
          <>
            {text ? (
              <Output
                inputRef={actionFocus.restore}
                label="Generated plain-text export"
                value={text}
                rows={6}
              />
            ) : (
              <Button variant="primary" onClick={createText} disabled={!cards?.length}>
                Export cards as plain text
              </Button>
            )}
            {mediaNote}
          </>
        );
    }
  }

  return (
    <section aria-labelledby={titleId} className="mt-8">
      <h2 id={titleId} className="mb-3 font-display text-xl">
        Other ways
      </h2>
      <div role="group" aria-labelledby={titleId} className="flex flex-wrap gap-2">
        {WAYS.map((option) => (
          <Button
            key={option.id}
            size="sm"
            variant={way === option.id ? 'inverse' : 'secondary'}
            aria-pressed={way === option.id}
            onClick={() => setWay((current) => (current === option.id ? null : option.id))}
          >
            {option.icon}
            {option.label}
          </Button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {way && (
          <motion.div key="panel" {...collapse(m)} className="overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={way}
                initial={m > 0 ? { opacity: 0, x: 8 } : false}
                animate={{ opacity: 1, x: 0 }}
                exit={m > 0 ? { opacity: 0, x: -8 } : undefined}
                transition={motionTransition('feedback', m)}
              >
                <SectionCard compact className="mt-4">
                  {panel(way)}
                </SectionCard>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
