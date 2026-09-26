import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import type { Html5Qrcode } from 'html5-qrcode';
import { CourseFileImportButton } from './CourseFileControls';
import {
  decodeCourseFile,
  MAX_COURSE_FILE_BYTES,
  withCourseFileAssets,
  type CourseFile,
} from '../../db/courseFile';
import {
  decodeShare,
  importSharePayload,
  summariseShare,
  type SharePayload,
  type ShareSummary,
} from '../../db/share';
import {
  findCourseForLineage,
  importLineageFirstTime,
  isLineagePayload,
  mergeLineageUpdate,
  type MergeLineageResult,
} from '../../db/mergeImport';
import type { CourseRecord } from '../../db/types';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { UploadIcon, CameraIcon, CloseIcon } from '../ui/icons';
import { formatDate } from '../../utils/datetime';

/** A decoded, not-yet-confirmed import. `merge` is present when the payload's lineage
 *  (Arc 7 §7.5) matches a course already imported locally — routing this to the merge
 *  importer instead of a plain new-course import. */
interface PendingShareImport {
  summary: ShareSummary;
  raw: string;
  file?: CourseFile;
  merge?: {
    course: CourseRecord;
    incomingRevision: number;
    /** True when `incomingRevision` is not newer than the local copy — nothing to merge. */
    stale: boolean;
  };
}

/** Decode-time lineage check (docs/archive/roadmap-2026-08-11.md §7.5): does this payload's lineage match a
 *  course already tracked locally? If so, route the confirm step to the merge importer
 *  instead of the plain `importSharePayload` path. */
async function resolvePending(payload: SharePayload, raw: string): Promise<PendingShareImport> {
  const summary = summariseShare(payload);
  if (isLineagePayload(payload)) {
    const course = await findCourseForLineage(payload.li);
    if (course) {
      const localRevision = course.distributedCopy?.revision ?? 0;
      return {
        summary,
        raw,
        merge: { course, incomingRevision: payload.rv, stale: payload.rv <= localRevision },
      };
    }
  }
  return { summary, raw };
}

/** Turn a merge result into a single sentence for the post-import toast. */
function describeMergeResult(result: MergeLineageResult): string {
  const parts: string[] = [];
  if (result.createdLessons || result.createdNotes || result.createdCards) {
    parts.push(
      `added ${result.createdLessons} lesson${result.createdLessons === 1 ? '' : 's'}, ` +
        `${result.createdNotes} note${result.createdNotes === 1 ? '' : 's'} and ` +
        `${result.createdCards} card${result.createdCards === 1 ? '' : 's'}`,
    );
  }
  if (result.appliedUpdates || result.appliedRemovals) {
    parts.push(
      `applied ${result.appliedUpdates} update${result.appliedUpdates === 1 ? '' : 's'} and ` +
        `${result.appliedRemovals} removal${result.appliedRemovals === 1 ? '' : 's'}`,
    );
  }
  let message =
    parts.length > 0
      ? `Updated the course — ${parts.join('; ')}.`
      : 'The course is already up to date.';
  if (result.queuedForReview) {
    message +=
      result.conflictCount > 0
        ? ` ${result.conflictCount} change${result.conflictCount === 1 ? '' : 's'} ${result.conflictCount === 1 ? 'is' : 'are'} waiting for your review.`
        : ' Some changes are waiting for your review.';
  }
  return message;
}

export function SharedCourseImport({
  importIntent = false,
  initialFile,
  onImported,
  onBusyChange,
}: {
  importIntent?: boolean;
  initialFile?: File;
  onImported?: (courseId: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { notify } = useToast();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingShareImport | null>(null);
  const inspectionGeneration = useRef(0);
  const [importing, setImporting] = useState(false);
  const importSectionRef = useRef<HTMLElement>(null);
  const importInputRef = useRef<HTMLTextAreaElement>(null);
  const [motionSpeed] = useMotionSpeed();

  // QR code scanning state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Clean up QR scanner on unmount
  useEffect(() => {
    return () => {
      const scanner = html5QrCodeRef.current;
      if (scanner) {
        html5QrCodeRef.current = null;
        void scanner
          .stop()
          .then(() => {
            void scanner.clear();
          })
          .catch(() => {
            // Ignore cleanup errors
          });
      }
    };
  }, []);

  const m = speedMultiplier(motionSpeed);

  // Welcome links carry an explicit import intent because the Share page opens
  // with export controls. Move the existing import job into view and put the
  // keyboard at its first actionable field once the lazy route has mounted.
  useEffect(() => {
    if (!importIntent) return;
    const id = window.requestAnimationFrame(() => {
      importSectionRef.current?.scrollIntoView({
        behavior: m > 0 ? 'smooth' : 'auto',
        block: 'start',
      });
      importInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [importIntent, m]);

  useEffect(() => {
    if (!initialFile) return;
    let cancelled = false;
    const generation = ++inspectionGeneration.current;
    setPending(null);
    void (async () => {
      try {
        if (initialFile.size > MAX_COURSE_FILE_BYTES)
          throw new Error('The course file exceeds the 100 MB limit.');
        const file = await decodeCourseFile(await initialFile.text());
        const next = await resolvePending(file.payload, '');
        if (!cancelled && generation === inspectionGeneration.current)
          setPending({ ...next, file });
      } catch (error) {
        if (!cancelled && generation === inspectionGeneration.current)
          notify(
            error instanceof Error ? error.message : 'Could not read the course file.',
            'negative',
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialFile, notify]);
  function beginInspection() {
    setPending(null);
    return ++inspectionGeneration.current;
  }

  async function handleInspect() {
    const raw = input.trim();
    if (!raw) return;
    const generation = beginInspection();
    try {
      const payload = await decodeShare(raw);
      const next = await resolvePending(payload, raw);
      if (generation === inspectionGeneration.current) setPending(next);
    } catch (err) {
      if (generation === inspectionGeneration.current)
        notify(err instanceof Error ? err.message : 'Invalid share code.', 'negative');
    }
  }

  async function handleImport() {
    if (!pending || pending.merge?.stale || importing) return;
    setImporting(true);
    onBusyChange?.(true);
    let importedCourseId: string | undefined;
    try {
      const payload = pending.file?.payload ?? (await decodeShare(pending.raw));
      const importContent = async () => {
        if (pending.merge) {
          importedCourseId = pending.merge.course.id;
          return describeMergeResult(await mergeLineageUpdate(pending.merge.course.id, payload));
        }
        if (isLineagePayload(payload)) {
          const result = await importLineageFirstTime(payload);
          importedCourseId = result?.course?.id;
          return `Added 1 course and ${pending.summary.cardCount} card${pending.summary.cardCount === 1 ? '' : 's'}.`;
        }
        const { courses, cards: count, courseIds } = await importSharePayload(payload);
        importedCourseId = courseIds?.[0];
        return `Added ${courses} course${courses === 1 ? '' : 's'} and ${count} card${count === 1 ? '' : 's'}.`;
      };
      let message: string;
      if (pending.file) {
        message = await withCourseFileAssets(pending.file, importContent);
      } else {
        message = await importContent();
      }
      notify(message, 'positive');
      setPending(null);
      setInput('');
      if (importedCourseId) onImported?.(importedCourseId);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Import failed — the shared course may be corrupted.',
        'negative',
      );
    } finally {
      setImporting(false);
      onBusyChange?.(false);
    }
  }

  async function handleStartScan() {
    if (html5QrCodeRef.current) return;
    setScanError(null);
    setScanning(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (!scannerRef.current) {
        setScanError('Scanner element not found.');
        setScanning(false);
        return;
      }
      const scanner = new Html5Qrcode(scannerRef.current.id);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          const generation = beginInspection();
          // Stop scanning immediately on success
          try {
            await scanner.stop();
            await scanner.clear();
          } catch {
            // Ignore stop errors — scanner may already be stopped
          }
          html5QrCodeRef.current = null;
          setScanning(false);
          try {
            const payload = await decodeShare(decodedText);
            const next = await resolvePending(payload, decodedText);
            if (generation === inspectionGeneration.current) setPending(next);
          } catch (err) {
            notify(err instanceof Error ? err.message : 'Invalid QR code.', 'negative');
          }
        },
        () => {
          // QR code not found in this frame — silent, keep scanning
        },
      );
    } catch (err) {
      html5QrCodeRef.current = null;
      setScanError(err instanceof Error ? err.message : 'Could not start camera scanner.');
      setScanning(false);
    }
  }

  async function handleStopScan() {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        await html5QrCodeRef.current.clear();
      } catch {
        // Ignore stop errors — scanner may already be stopped
      }
      html5QrCodeRef.current = null;
    }
    setScanning(false);
    setScanError(null);
  }

  return (
    <section ref={importSectionRef} className="rounded-2xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center gap-2">
        <UploadIcon width={18} height={18} className="text-accent" />
        <h2 className="font-display text-xl">Import a shared course</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Choose a course file or paste a share code, then review it before importing. Published
        course updates are matched to your existing copy. All Lacuna share-code encodings
        (LAC0–LAC3) are supported.
      </p>

      <CourseFileImportButton
        disabled={importing}
        onReadStart={beginInspection}
        onInspect={async (file, generation) => {
          const next = await resolvePending(file.payload, '');
          if (generation === inspectionGeneration.current) setPending({ ...next, file });
        }}
      />

      <div className="rounded-xl border border-line-strong bg-surface px-4 py-3 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
        <textarea
          ref={importInputRef}
          aria-label="Share code to import"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            beginInspection();
          }}
          rows={4}
          placeholder="Paste a Lacuna share code here (it starts with LAC)..."
          className="w-full resize-none break-all bg-transparent font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-sm placeholder:text-ink-faint"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={handleInspect} disabled={importing || !input.trim()}>
          Read code
        </Button>
        <Button
          variant="secondary"
          onClick={scanning ? handleStopScan : handleStartScan}
          disabled={importing || !navigator.mediaDevices?.getUserMedia}
        >
          <CameraIcon width={18} height={18} />
          {scanning ? 'Stop scanning' : 'Scan QR code'}
        </Button>
      </div>

      {/* QR scanner */}
      <AnimatePresence>
        {scanning && (
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
                  QR scanner
                </span>
                <Button size="sm" variant="ghost" onClick={handleStopScan}>
                  <CloseIcon width={14} height={14} />
                </Button>
              </div>
              <div
                id="qr-scanner-container"
                ref={scannerRef}
                className="relative mx-auto aspect-square max-w-sm overflow-hidden rounded-lg bg-black"
              >
                {!scanError && <div className="absolute inset-0 animate-pulse bg-ink/10" />}
              </div>
              {scanError && <p className="mt-2 text-sm text-negative">{scanError}</p>}
              <p className="mt-2 text-xs text-ink-faint">
                Point your camera at a Lacuna QR code. The scanner will auto-detect it.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pending && (
          <motion.div
            initial={m > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={m > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5"
          >
            <div className="rounded-xl border border-accent/40 bg-accent-soft/40 p-5">
              <h3 className="mb-2 font-display text-lg">
                {pending.merge ? 'Course update' : 'Ready to import'}
              </h3>
              {pending.merge ? (
                <p className="mb-3 text-sm text-ink-soft">
                  {pending.merge.stale ? (
                    <>
                      You already have the latest version of{' '}
                      <strong className="text-ink">{pending.merge.course.name}</strong> (revision{' '}
                      {pending.merge.course.distributedCopy?.revision ?? 0}).
                    </>
                  ) : (
                    <>
                      This updates <strong className="text-ink">{pending.merge.course.name}</strong>{' '}
                      (revision {pending.merge.course.distributedCopy?.revision ?? 0} →{' '}
                      {pending.merge.incomingRevision}).
                    </>
                  )}
                </p>
              ) : pending.summary.kind === 'course' ? (
                <p className="mb-3 text-sm text-ink-soft">
                  <strong className="text-ink">{pending.summary.courseName}</strong> —{' '}
                  <strong className="text-ink">{pending.summary.lessonCount}</strong> lesson
                  {pending.summary.lessonCount === 1 ? '' : 's'},{' '}
                  <strong className="text-ink">{pending.summary.noteCount ?? 0}</strong> note
                  {pending.summary.noteCount === 1 ? '' : 's'} and{' '}
                  <strong className="text-ink">{pending.summary.cardCount}</strong> card
                  {pending.summary.cardCount === 1 ? '' : 's'}, shared on{' '}
                  {formatDate(pending.summary.exportedAt)}.
                </p>
              ) : (
                <p className="mb-3 text-sm text-ink-soft">
                  This code contains{' '}
                  <strong className="text-ink">{pending.summary.deckCount}</strong> lesson
                  {pending.summary.deckCount === 1 ? '' : 's'} and{' '}
                  <strong className="text-ink">{pending.summary.cardCount}</strong> card
                  {pending.summary.cardCount === 1 ? '' : 's'}, shared on{' '}
                  {formatDate(pending.summary.exportedAt)}. It will be added as a single imported
                  course.
                </p>
              )}
              {!pending.merge && pending.summary.deckNames.length > 0 && (
                <ul className="mb-4 flex flex-wrap gap-1.5">
                  {pending.summary.deckNames.map((name, i) => (
                    <li
                      key={`${name}-${i}`}
                      className="rounded-lg border border-line bg-surface px-3 py-1 text-xs text-ink-soft"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
              {!pending.merge && pending.summary.omittedImages && (
                <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
                  This share code omitted media to keep the code small. Images and audio will appear
                  as placeholders after import. Use a full backup for an exact transfer.
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setPending(null)}>
                  {pending.merge?.stale ? 'Close' : 'Cancel'}
                </Button>
                {!pending.merge?.stale && (
                  <Button variant="primary" onClick={handleImport} disabled={importing}>
                    {importing
                      ? pending.merge
                        ? 'Updating…'
                        : 'Importing…'
                      : pending.merge
                        ? 'Update course'
                        : 'Add to my courses'}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
