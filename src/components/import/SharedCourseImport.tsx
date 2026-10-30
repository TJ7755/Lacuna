import { SectionCard } from '../ui/SectionCard';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { parseShareCode } from '../../shareLinks/client';
import { formatClassCode, parseClassCode, normaliseShortClassCode } from '../../insights/classCode';
import { useCourseQrScanner } from './useCourseQrScanner';
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
  type ImportCourseScheduling,
} from '../../db/share';
import {
  findCourseForLineage,
  importLineageFirstTime,
  isLineagePayload,
  mergeLineageUpdate,
  type MergeLineageResult,
} from '../../db/mergeImport';
import type { CourseRecord, CourseSchedulingMode } from '../../db/types';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { UploadIcon, CameraIcon, CloseIcon } from '../ui/icons';
import { chosenStudyTarget } from '../../onboarding/onboardingState';
import {
  defaultExamDate,
  formatDate,
  formatDateTime,
  getLocalTimeZone,
} from '../../utils/datetime';
import { CourseStudyTarget } from '../course/CourseStudyTarget';
import { LibraryCourseCoverage } from '../../library/LibraryCourseCoverage';

/** A decoded, not-yet-confirmed import. `merge` is present when the payload's lineage
 *  (Arc 7 §7.5) matches a course already imported locally — routing this to the merge
 *  importer instead of a plain new-course import. */
interface PendingShareImport {
  summary: ShareSummary;
  raw: string;
  file?: CourseFile;
  sourceShareId?: string;
  scheduling?: {
    mode: CourseSchedulingMode | null;
    examDate: number;
    timeZone: string;
    valid: boolean;
    suggestion?: string;
    /** Onboarding already asked, so the picker is not shown again. */
    fromOnboarding: boolean;
  };
  merge?: {
    course: CourseRecord;
    incomingRevision: number;
    /** True when `incomingRevision` is not newer than the local copy — nothing to merge. */
    stale: boolean;
  };
}

/** Decode-time lineage check: does this payload's lineage match a
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
  if (payload.v === 1) return { summary, raw };
  const final = payload.exams?.find((exam) => exam.k === 'f');
  const suggestedDate = (final ? final.sm !== 1 : payload.course?.sm !== 1)
    ? (final?.e ?? payload.course?.e)
    : undefined;
  const chosen = chosenStudyTarget();
  // Onboarding's date was picked in the learner's own zone, so it is kept in that zone.
  const timeZone = (!chosen && final?.tz) || getLocalTimeZone();
  return {
    summary,
    raw,
    scheduling: payload.course
      ? {
          // Onboarding has just asked, so its answer (and the learner's own date) wins. Otherwise
          // a teacher's suggested date is never taken as confirmed: the learner chooses.
          mode: chosen?.mode ?? null,
          examDate: chosen?.examDate ?? suggestedDate ?? defaultExamDate(),
          timeZone,
          valid: true,
          suggestion:
            suggestedDate === undefined ? undefined : formatDateTime(suggestedDate, timeZone),
          fromOnboarding: !!chosen,
        }
      : undefined,
  };
}

/** A share-link code (or full link) when the text is one, else null. Text share
 *  codes fall through to the ordinary decode path. */
function tryParseShareCode(raw: string): string | null {
  const shortCode = normaliseShortClassCode(raw);
  if (shortCode) return shortCode;
  try {
    return formatClassCode(parseClassCode(raw));
  } catch {
    /* Try an ordinary share link. */
  }
  try {
    return parseShareCode(raw);
  } catch {
    return null;
  }
}

/**
 * Open a share link through the hash router directly, matching the existing
 * `window.location.hash` navigation in App and Settings. This keeps the
 * importer usable wherever it is embedded without requiring router context.
 */
function openShareLink(shareId: string): void {
  window.location.hash = `#/s/${shareId}`;
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
  initialFile,
  sourceShareId,
  onImported,
  onBusyChange,
  chosen = false,
}: {
  initialFile?: File;
  /** Provenance for the initial link file only; inspecting another source clears it. */
  sourceShareId?: string;
  onImported?: (courseId: string) => void;
  onBusyChange?: (busy: boolean) => void;
  /** The learner already picked this course, so other ways to find one are hidden. */
  chosen?: boolean;
}) {
  const { notify } = useToast();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingShareImport | null>(null);
  const inspectionGeneration = useRef(0);
  const [importing, setImporting] = useState(false);
  // Stays beside the task until the next attempt, rather than as a passing toast.
  const [error, setError] = useState('');
  const [motionSpeed] = useMotionSpeed();

  const {
    scanning,
    scanError,
    scannerRef,
    scannerId,
    startScanning: handleStartScan,
    stopScanning: handleStopScan,
  } = useCourseQrScanner(async (text) => {
    // A scanned share link (or its bare code) opens the link importer rather
    // than decoding as a text code — the s/:code route fetches the course.
    const shareId = tryParseShareCode(text);
    if (shareId) {
      openShareLink(shareId);
      return;
    }
    const generation = beginInspection();
    try {
      const payload = await decodeShare(text);
      const next = await resolvePending(payload, text);
      if (generation === inspectionGeneration.current) setPending(next);
    } catch (error) {
      if (generation === inspectionGeneration.current)
        setError(error instanceof Error ? error.message : 'Invalid QR code.');
    }
  });

  const m = speedMultiplier(motionSpeed);

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
          setPending({ ...next, file, sourceShareId });
      } catch (error) {
        if (!cancelled && generation === inspectionGeneration.current)
          setError(error instanceof Error ? error.message : 'Could not read the course file.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialFile, sourceShareId]);
  function beginInspection() {
    setPending(null);
    setError('');
    return ++inspectionGeneration.current;
  }

  async function handleInspect() {
    const raw = input.trim();
    if (!raw) return;
    // A pasted share link (or its bare code) opens the link importer rather
    // than decoding as a text code — the s/:code route fetches the course.
    const shareId = tryParseShareCode(raw);
    if (shareId) {
      openShareLink(shareId);
      return;
    }
    const generation = beginInspection();
    try {
      const payload = await decodeShare(raw);
      const next = await resolvePending(payload, raw);
      if (generation === inspectionGeneration.current) setPending(next);
    } catch (err) {
      if (generation === inspectionGeneration.current)
        setError(err instanceof Error ? err.message : 'Invalid share code.');
    }
  }

  const schedulingReady =
    !pending?.scheduling ||
    (pending.scheduling.mode !== null &&
      (pending.scheduling.mode === 'steady' ||
        (pending.scheduling.valid && Number.isFinite(pending.scheduling.examDate))));

  function updateScheduling(changes: Partial<NonNullable<PendingShareImport['scheduling']>>) {
    setPending((current) => {
      const scheduling = current?.scheduling;
      if (!scheduling) return current;
      if (
        Object.entries(changes).every(
          ([key, value]) => scheduling[key as keyof typeof scheduling] === value,
        )
      )
        return current;
      return { ...current, scheduling: { ...scheduling, ...changes } };
    });
  }

  async function handleImport() {
    if (!pending || pending.merge?.stale || importing || !schedulingReady) return;
    setImporting(true);
    setError('');
    onBusyChange?.(true);
    let importedCourseId: string | undefined;
    try {
      const payload = pending.file?.payload ?? (await decodeShare(pending.raw));
      const choice = pending.scheduling;
      const scheduling: ImportCourseScheduling | undefined =
        choice?.mode === 'exam'
          ? { schedulingMode: 'exam', examDate: choice.examDate, timeZone: choice.timeZone }
          : choice?.mode === 'steady'
            ? { schedulingMode: 'steady' }
            : undefined;
      const importContent = async () => {
        if (pending.merge) {
          importedCourseId = pending.merge.course.id;
          return describeMergeResult(await mergeLineageUpdate(pending.merge.course.id, payload));
        }
        if (isLineagePayload(payload)) {
          const result = await importLineageFirstTime(payload, scheduling);
          importedCourseId = result?.course?.id;
          return `Added 1 course and ${pending.summary.cardCount} card${pending.summary.cardCount === 1 ? '' : 's'}.`;
        }
        const { courses, cards: count, courseIds } = await importSharePayload(payload, scheduling);
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
      setError(
        err instanceof Error ? err.message : 'Import failed — the shared course may be corrupted.',
      );
    } finally {
      setImporting(false);
      onBusyChange?.(false);
    }
  }

  return (
    <SectionCard
      className="rounded-3xl bg-surface card-surface p-6"
      onKeyDown={(event) => {
        // Ctrl/Cmd+Enter does the next step: import once a course is read, otherwise read the code.
        if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.defaultPrevented)
          return;
        event.preventDefault();
        if (pending) void handleImport();
        else if (input.trim() && !importing) void handleInspect();
      }}
    >
      <div className="mb-5 flex items-center gap-2">
        <UploadIcon width={18} height={18} className="text-accent-ink" />
        <h2 className="font-display text-xl">
          {chosen ? 'Add this course' : 'Import a shared course'}
        </h2>
      </div>

      {!chosen && (
        <>
          <CourseFileImportButton
            disabled={importing}
            onReadStart={beginInspection}
            onError={(message, generation) => {
              if (generation === inspectionGeneration.current) setError(message);
            }}
            onInspect={async (file, generation) => {
              const next = await resolvePending(file.payload, '');
              if (generation === inspectionGeneration.current) setPending({ ...next, file });
            }}
          />

          <div className="rounded-2xl bg-paper/70 px-4 py-3 transition-shadow focus-within:bg-surface focus-within:shadow-[0_0_0_2px_hsl(var(--ink))]">
            <textarea
              aria-label="Share link or code to import"
              autoFocus
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                beginInspection();
              }}
              rows={4}
              placeholder="Paste a share link or code"
              className="w-full resize-none break-all bg-transparent font-mono text-xs text-ink outline-none placeholder:font-body placeholder:text-sm placeholder:text-ink-faint"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={handleInspect}
              disabled={importing || !input.trim()}
            >
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
        </>
      )}

      {(error || scanError) && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error || scanError}
        </p>
      )}
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
            <div className="rounded-2xl bg-paper p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-display text-lg text-ink">QR scanner</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Close scanner"
                  onClick={handleStopScan}
                >
                  <CloseIcon width={14} height={14} />
                </Button>
              </div>
              <div
                id={scannerId}
                ref={scannerRef}
                className="relative mx-auto aspect-square max-w-sm overflow-hidden rounded-lg bg-black"
              />
              {scanError && <p className="mt-2 text-sm text-negative">{scanError}</p>}
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
            <div className="rounded-2xl bg-accent-soft/50 p-5">
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
              {!pending.merge && pending.summary.omittedImages && (
                <p className="mb-4 rounded-2xl bg-ink/[0.06] px-4 py-3 text-sm text-ink-soft">
                  This share code omitted media to keep the code small. Images and audio will appear
                  as placeholders after import. Use a full backup for an exact transfer.
                </p>
              )}
              <LibraryCourseCoverage shareId={pending.sourceShareId} />
              {pending.scheduling?.fromOnboarding && (
                <p className="mb-5 text-sm text-ink-soft">
                  {pending.scheduling.mode === 'exam'
                    ? `Reviews build up to your exam on ${formatDateTime(pending.scheduling.examDate, pending.scheduling.timeZone)}.`
                    : 'Reviews keep everything fresh, with no exam date.'}{' '}
                  You can change this in Course settings.
                </p>
              )}
              {pending.scheduling && !pending.scheduling.fromOnboarding && (
                <div className="mb-5 space-y-3">
                  <p className="text-sm text-ink-soft">
                    {pending.scheduling.suggestion && (
                      <>Teacher suggests {pending.scheduling.suggestion}. </>
                    )}
                    Choose Exam date to confirm or change your date, or Steady retention for no
                    fixed exam. Your choice stays yours when the teacher updates this course.
                  </p>
                  <CourseStudyTarget
                    schedulingMode={pending.scheduling.mode}
                    setSchedulingMode={(mode) => updateScheduling({ mode })}
                    saving={importing}
                    examDate={pending.scheduling.examDate}
                    setExamDate={(examDate) => updateScheduling({ examDate })}
                    setExamDateValid={(valid) => updateScheduling({ valid })}
                    timeZone={pending.scheduling.timeZone}
                  />
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {/* A chosen course has nothing to return to here; the panel offers the way back. */}
                {!chosen && (
                  <Button variant="ghost" onClick={() => setPending(null)}>
                    {pending.merge?.stale ? 'Close' : 'Cancel'}
                  </Button>
                )}
                {!pending.merge?.stale && (
                  <Button
                    variant="primary"
                    onClick={handleImport}
                    disabled={importing || !schedulingReady}
                  >
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
              {!pending.merge && pending.summary.deckNames.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {pending.summary.deckNames.map((name, i) => (
                    <li
                      key={`${name}-${i}`}
                      className="rounded-full bg-ink/[0.06] px-3 py-1 text-xs text-ink-soft"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SectionCard>
  );
}
