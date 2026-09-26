import { CourseFileExportButton } from '../components/import/CourseFileControls';
import { SharedCourseImport } from '../components/import/SharedCourseImport';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useCourse, useCourseCards, useCourses, useCourseSummaries } from '../state/useCourseData';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { cn } from '../components/ui/cn';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { buildCourseShareCode, buildCourseShareCodeQR } from '../db/share';
import { referencedAssetHashes } from '../db/assets';
import { exportCardsSimple } from '../db/export';
import { publishCourse } from '../db/courseRepository';
import type { Card } from '../db/types';
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  ShareIcon,
  CardsIcon,
  FileTextIcon,
  QrCodeIcon,
} from '../components/ui/icons';
import { formatRelativeTime } from '../utils/datetime';
import QRCode from 'react-qr-code';

/** Maximum characters a single QR code (version 40, L error correction) can hold in Alphanumeric mode. */
const MAX_QR_ALPHANUMERIC_CHARS = 4296;

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

/**
 * Share course files with media, or compact text codes, through the same import preview.
 */
export function SharePage() {
  const courses = useCourses();
  const summaries = useCourseSummaries();
  const { notify } = useToast();
  const [searchParams] = useSearchParams();

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const copyTimeoutRef = useRef<number | null>(null);
  const plainTextCopyTimeoutRef = useRef<number | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const [plainText, setPlainText] = useState('');
  const [plainTextCopied, setPlainTextCopied] = useState(false);

  // QR code generation state
  const [qrCode, setQrCode] = useState('');
  const [qrGenerating, setQrGenerating] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Clear pending copy timeouts on unmount to avoid setState on unmounted component.
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      if (plainTextCopyTimeoutRef.current) window.clearTimeout(plainTextCopyTimeoutRef.current);
    };
  }, []);

  const courseCards = useCourseCards(selectedCourseId ?? undefined);

  const m = speedMultiplier(motionSpeed);

  const selectedCourse = useCourse(selectedCourseId ?? undefined);
  const selectedSummary = selectedCourseId ? summaries?.[selectedCourseId] : undefined;
  // Two ways a card carries media a share code cannot: an asset embed in its Markdown
  // (images, audio), and an occlusion diagram, which lives on `Occlusion.assetHash` and so
  // never appears in the card's text at all. Occlusion cards degrade to their plain-text
  // fallback for the recipient rather than breaking, but they are still not the card the
  // author made — Arc 6 §6.6.
  const selectedMediaCards = useMemo(
    () =>
      (courseCards ?? []).filter(
        (card) =>
          card.occlusionRegionId !== undefined ||
          referencedAssetHashes(`${card.front}\n${card.back}`).length > 0,
      ),
    [courseCards],
  );

  function select(id: string) {
    setSelectedCourseId((prev) => (prev === id ? null : id));
    // Any change invalidates a previously generated code or plain text export.
    setCode('');
    setPlainText('');
    setQrCode('');
    setShowQR(false);
  }

  async function handlePublish() {
    if (!selectedCourseId) return;
    setPublishing(true);
    try {
      await publishCourse(selectedCourseId);
      // Keep an already-generated code in sync with the new revision, rather than
      // leaving a stale pre-publish code on screen.
      if (code) {
        const refreshed = await buildCourseShareCode(selectedCourseId);
        setCode(refreshed);
        setCopied(false);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not publish this course.', 'negative');
    } finally {
      setPublishing(false);
    }
  }

  async function handleGenerate() {
    if (!selectedCourseId) return;
    setGenerating(true);
    try {
      const result = await buildCourseShareCode(selectedCourseId);
      setCode(result);
      setCopied(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not generate a share code.', 'negative');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateQR() {
    if (!selectedCourseId) return;
    setQrGenerating(true);
    setQrCode('');
    setShowQR(false);
    try {
      const result = await buildCourseShareCodeQR(selectedCourseId);
      if (result.length > MAX_QR_ALPHANUMERIC_CHARS) {
        notify(
          'This course is too large for a single QR code. Use the text share code instead.',
          'negative',
        );
        return;
      }
      setQrCode(result);
      setShowQR(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not generate a QR code.', 'negative');
    } finally {
      setQrGenerating(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      notify('Share code copied to the clipboard.', 'positive');
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('Copy failed — select the code and copy it manually.', 'negative');
    }
  }

  async function handleCopyQR() {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      notify('QR code text copied to the clipboard.', 'positive');
    } catch {
      notify('Copy failed — select the text and copy it manually.', 'negative');
    }
  }

  function handleExportPlainText() {
    if (!selectedCourseId || !courseCards || courseCards.length === 0) {
      notify('The selected course has no cards to export.', 'negative');
      return;
    }
    const text = exportCardsSimple(courseCards);
    setPlainText(text);
    setPlainTextCopied(false);
  }

  async function handleCopyPlainText() {
    try {
      await navigator.clipboard.writeText(plainText);
      setPlainTextCopied(true);
      notify('Copied to clipboard.', 'positive');
      if (plainTextCopyTimeoutRef.current) window.clearTimeout(plainTextCopyTimeoutRef.current);
      plainTextCopyTimeoutRef.current = window.setTimeout(() => setPlainTextCopied(false), 2000);
    } catch {
      notify('Copy failed — select the text and copy it manually.', 'negative');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
      <header className="mb-10">
        <div className="relative">
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">Share</h1>
        </div>
      </header>

      {/* Export */}
      <section className="mb-8 rounded-2xl border border-line bg-surface p-6">
        <div className="mb-1 flex items-center gap-2">
          <DownloadIcon width={18} height={18} className="text-accent" />
          <h2 className="font-display text-xl">Export a course</h2>
        </div>
        <p className="mb-5 text-sm text-ink-soft">
          Save a course file to share lessons, cards and media. Your study history stays private.
          Text and QR codes are also available, but omit media files.{' '}
          <Link to="/settings#settings-export" className="text-accent underline underline-offset-2">
            Open full backup and recovery
          </Link>
          .
        </p>

        {!courses ? (
          <DelayedFallback>
            <ShareSkeleton />
          </DelayedFallback>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/50 py-16 text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent">
              <CardsIcon width={22} height={22} />
            </div>
            <h3 className="mb-1 font-display text-xl">No courses yet</h3>
            <p className="max-w-sm text-sm text-ink-soft">
              Create a course first, then come back here to share it with others.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {courses.map((course) => {
                const on = selectedCourseId === course.id;
                const summary = summaries?.[course.id];
                return (
                  <motion.button
                    key={course.id}
                    type="button"
                    onClick={() => select(course.id)}
                    aria-pressed={on}
                    whileHover={m > 0 ? { y: -2, transition: { duration: 0.1 * m } } : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-sm transition-all duration-200',
                      on
                        ? 'border-accent bg-accent-soft/50 shadow-paper'
                        : 'border-line bg-surface hover:border-line-strong hover:shadow-md',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                        on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong',
                      )}
                    >
                      <AnimatePresence>
                        {on && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                            className="inline-flex"
                          >
                            <CheckIcon width={13} height={13} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{course.name}</span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {summary?.lessonCount ?? 0} lesson{summary?.lessonCount === 1 ? '' : 's'} ·{' '}
                      {summary?.cardCount ?? 0} card{summary?.cardCount === 1 ? '' : 's'}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-5">
              {selectedCourse && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3">
                  {selectedCourse.distribution ? (
                    <>
                      <p className="text-sm text-ink-soft">
                        Revision {selectedCourse.distribution.revision} · published{' '}
                        {formatRelativeTime(selectedCourse.distribution.publishedAt)}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handlePublish()}
                        disabled={publishing}
                      >
                        {publishing ? 'Publishing…' : 'Publish update'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-ink-soft">
                        Publishing lets students receive updates when you share a new code.
                      </p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handlePublish()}
                        disabled={publishing}
                      >
                        {publishing ? 'Publishing…' : 'Publish course'}
                      </Button>
                    </>
                  )}
                </div>
              )}
              {selectedMediaCards.length > 0 && (
                <div className="mb-3 rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-ink-soft">
                  <p>
                    This course contains media in {selectedMediaCards.length}{' '}
                    {selectedMediaCards.length === 1 ? 'card' : 'cards'}. The share code cannot
                    carry the files: recipients get a placeholder in their place, and diagram cards
                    fall back to text with no image to label. Save a course file to include the
                    media.
                  </p>
                  <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-ink-faint">
                    {selectedMediaCards.map((card, index) => (
                      <li key={`${card.id}-${index}`}>{mediaCardLabel(card, index)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <CourseFileExportButton
                  courseId={selectedCourseId}
                  name={selectedCourse?.name ?? 'Course'}
                />
                <Button
                  variant="secondary"
                  onClick={handleGenerate}
                  disabled={!selectedCourseId || generating}
                >
                  <ShareIcon width={18} height={18} />
                  {generating ? 'Generating…' : 'Generate share code'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleGenerateQR}
                  disabled={!selectedCourseId || qrGenerating}
                >
                  <QrCodeIcon width={18} height={18} />
                  {qrGenerating ? 'Generating…' : 'Generate QR code'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleExportPlainText}
                  disabled={!selectedCourseId || !selectedSummary?.cardCount}
                >
                  <FileTextIcon width={18} height={18} />
                  Export cards as plain text
                </Button>
              </div>
            </div>

            {/* Share code text area */}
            <AnimatePresence>
              {code && (
                <motion.div
                  initial={m > 0 ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  exit={m > 0 ? { opacity: 0 } : undefined}
                  transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-5"
                >
                  <div className="rounded-xl border border-line-strong bg-surface-raised p-4 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">
                        Your share code · {code.length.toLocaleString()} characters
                      </span>
                      <Button size="sm" variant="secondary" onClick={handleCopy}>
                        {copied ? (
                          <>
                            <CheckIcon width={14} height={14} />
                            Copied
                          </>
                        ) : (
                          'Copy'
                        )}
                      </Button>
                    </div>
                    <textarea
                      readOnly
                      aria-label="Generated share code"
                      value={code}
                      onFocus={(e) => e.currentTarget.select()}
                      rows={4}
                      className="w-full resize-none break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-soft outline-none"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* QR code display */}
            <AnimatePresence>
              {showQR && qrCode && (
                <motion.div
                  initial={m > 0 ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  exit={m > 0 ? { opacity: 0 } : undefined}
                  transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-5"
                >
                  <div className="rounded-xl border border-line-strong bg-surface-raised p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">
                        QR code · {qrCode.length.toLocaleString()} characters
                      </span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={handleCopyQR}>
                          Copy text
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowQR(false)}>
                          <CloseIcon width={14} height={14} />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-4">
                      <div className="rounded-xl border border-line bg-white p-4 dark:bg-white">
                        <QRCode
                          value={qrCode}
                          size={256}
                          level="L"
                          bgColor="#ffffff"
                          fgColor="#000000"
                        />
                      </div>
                      <p className="text-xs text-ink-faint">
                        This QR code uses a Base45-encoded share code for maximum density. Any
                        camera can scan it.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {plainText && (
                <motion.div
                  initial={m > 0 ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  exit={m > 0 ? { opacity: 0 } : undefined}
                  transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-5"
                >
                  <div className="rounded-xl border border-line-strong bg-surface-raised p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">
                        Plain text export · {(courseCards?.length ?? 0).toLocaleString()} card
                        {(courseCards?.length ?? 0) === 1 ? '' : 's'}
                      </span>
                      <Button size="sm" variant="secondary" onClick={handleCopyPlainText}>
                        {plainTextCopied ? (
                          <>
                            <CheckIcon width={14} height={14} />
                            Copied
                          </>
                        ) : (
                          'Copy'
                        )}
                      </Button>
                    </div>
                    <textarea
                      readOnly
                      aria-label="Generated plain-text export"
                      value={plainText}
                      onFocus={(e) => e.currentTarget.select()}
                      rows={6}
                      className="w-full resize-none break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-soft outline-none"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </section>

      <SharedCourseImport importIntent={searchParams.get('intent') === 'import'} />
    </div>
  );
}

function ShareSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
        >
          <div className="h-5 w-5 animate-pulse rounded-md bg-ink/10" />
          <div className="h-4 flex-1 animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-16 animate-pulse rounded bg-ink/10" />
        </div>
      ))}
    </div>
  );
}
