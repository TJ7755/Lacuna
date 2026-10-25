import { useEffect, useState, type ReactNode } from 'react';
import { StepSwap } from '../ui/StepSwap';
import { Skeleton } from '../ui/Skeleton';
import { DelayedFallback } from '../ui/DelayedFallback';
import { Button } from '../ui/Button';
import { SharedCourseImport } from './SharedCourseImport';
import {
  DEFAULT_RELAY_URL,
  getShareBytes,
  parseShareCode,
  resolveShortClassCode,
  parseShareManifest,
} from '../../shareLinks/client';
import { confirmShareImport } from '../../shareLinks/linkStore';
import { findCourseForLineage } from '../../db/mergeImport';
import { parseClassCode, normaliseShortClassCode } from '../../insights/classCode';
import { getClassRecipient, getPublishedClassRecipient } from '../../insights/classKey';
import type { InsightsRecipient } from '../../insights/recipient';
import { enrolInClass } from '../../insights/enrolment';
import { CourseInsightsSection } from '../../pages/settings/CourseInsightsSection';

type ShareLinkState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'incomplete'; message: string }
  | {
      status: 'ready';
      file: File;
      shareId: string;
      expectedLineageId: string;
      recipient?: InsightsRecipient;
    };

const UNAVAILABLE_MESSAGE =
  'This link is invalid or has been removed. Ask the teacher for a fresh link.';

const INCOMPLETE_MESSAGE =
  'The link loaded, but its update details are missing. Check your connection, then try again — importing now would miss future teacher updates.';

/**
 * Fetches a published course for a share link, class code or library course from the relay,
 * then hands it to the shared-course importer. The share link page and the import panel's
 * course library both use it.
 */
export function ShareLinkImport({
  code,
  isCurrent,
  onOpenCourse,
  alternative,
  chosen,
}: {
  code: string;
  /** False once the learner has moved on, so a late import does not navigate. */
  isCurrent: () => boolean;
  /** Called after a share link import; a class import stays here to show insights. */
  onOpenCourse: (courseId: string) => void;
  /** Offered beside Try again when the link cannot be used. */
  alternative?: (shortCode: boolean) => ReactNode;
  /** Passed to the importer when the learner picked the course in Lacuna. */
  chosen?: boolean;
}) {
  const [state, setState] = useState<ShareLinkState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [joinedCourse, setJoinedCourse] = useState<string | null>(null);
  const [joinError, setJoinError] = useState('');

  async function join(
    shareId: string,
    lineageId: string,
    courseId: string,
    recipient?: InsightsRecipient,
  ) {
    if (!(await confirmShareImport(shareId, lineageId, courseId)))
      throw new Error('This imported course does not match the class invitation.');
    if (recipient) {
      enrolInClass(courseId, { shareId, lineageId, recipient });
      setJoinedCourse(courseId);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setJoinedCourse(null);
    setJoinError('');
    setState({ status: 'loading' });
    void (async () => {
      let shareId: string;
      let keyId: string | undefined;
      const shortCode = normaliseShortClassCode(code);
      try {
        if (shortCode)
          shareId = await resolveShortClassCode({
            relayUrl: DEFAULT_RELAY_URL,
            code: shortCode,
            signal: controller.signal,
          });
        else if (code.startsWith('GAPS1_')) ({ shareId, keyId } = parseClassCode(code));
        else shareId = parseShareCode(code);
      } catch (error) {
        if (!cancelled)
          setState({
            status: 'unavailable',
            message: shortCode && error instanceof Error ? error.message : UNAVAILABLE_MESSAGE,
          });
        return;
      }
      try {
        const result = await getShareBytes({
          relayUrl: DEFAULT_RELAY_URL,
          shareId,
          slot: 'payload',
          signal: controller.signal,
        });
        if (cancelled) return;
        if (!result) {
          setState({ status: 'unavailable', message: UNAVAILABLE_MESSAGE });
          return;
        }
        // The manifest names the lineage this link serves. Without it the
        // import cannot be tracked: the payload alone does not prove it is
        // the linked course, and an untracked import would permanently miss
        // teacher updates. Show an incomplete state with a retry instead —
        // importing stays available once the manifest verifies.
        let manifestSlot;
        try {
          manifestSlot = await getShareBytes({
            relayUrl: DEFAULT_RELAY_URL,
            shareId,
            slot: 'meta',
            signal: controller.signal,
          });
        } catch (error) {
          if (cancelled) return;
          setState({
            status: 'unavailable',
            message: error instanceof Error ? error.message : UNAVAILABLE_MESSAGE,
          });
          return;
        }
        if (cancelled) return;
        if (!manifestSlot) {
          setState({ status: 'incomplete', message: INCOMPLETE_MESSAGE });
          return;
        }
        let expectedLineageId: string;
        try {
          expectedLineageId = parseShareManifest(manifestSlot.bytes).lineageId;
        } catch {
          if (cancelled) return;
          setState({ status: 'unavailable', message: UNAVAILABLE_MESSAGE });
          return;
        }
        if (cancelled) return;
        const keyOptions = { shareId, relayUrl: DEFAULT_RELAY_URL, signal: controller.signal };
        const recipient = shortCode
          ? await getPublishedClassRecipient(keyOptions)
          : keyId
            ? await getClassRecipient({ ...keyOptions, keyId })
            : undefined;
        if (cancelled) return;
        if (recipient) {
          const existing = await findCourseForLineage(expectedLineageId);
          if (existing && !cancelled)
            await join(shareId, expectedLineageId, existing.id, recipient);
        }
        if (cancelled) return;
        setState({
          status: 'ready',
          shareId,
          expectedLineageId,
          recipient,
          file: new File([toArrayBuffer(result.bytes)], 'shared-course.lacuna', {
            type: 'application/json',
          }),
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'unavailable',
            message: error instanceof Error ? error.message : UNAVAILABLE_MESSAGE,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [code, attempt]);

  const retry = (title: string, message: string) => (
    <section className="rounded-3xl bg-surface card-surface p-6">
      <h2 className="mb-1 font-display text-xl">{title}</h2>
      <p className="mb-5 text-sm text-ink-soft">{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
          Try again
        </Button>
        {alternative?.(!!normaliseShortClassCode(code))}
      </div>
    </section>
  );

  return (
    <StepSwap stepKey={state.status}>
      {state.status === 'loading' ? (
        <DelayedFallback>
          <ShareLinkSkeleton />
        </DelayedFallback>
      ) : state.status === 'unavailable' ? (
        retry('This link is unavailable', state.message)
      ) : state.status === 'ready' ? (
        <div className="space-y-6">
          <SharedCourseImport
            initialFile={state.file}
            chosen={chosen}
            onImported={(courseId) => {
              if (!isCurrent()) return;
              void join(state.shareId, state.expectedLineageId, courseId, state.recipient)
                .then(() => {
                  if (!isCurrent() || state.recipient) return;
                  onOpenCourse(courseId);
                })
                .catch((error) =>
                  setJoinError(
                    error instanceof Error ? error.message : 'Could not join this class.',
                  ),
                );
            }}
          />
          {joinedCourse && <CourseInsightsSection key={joinedCourse} courseId={joinedCourse} />}
          {joinError && (
            <p role="alert" className="text-negative">
              {joinError}
            </p>
          )}
        </div>
      ) : (
        retry('This link is incomplete', state.message)
      )}
    </StepSwap>
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function ShareLinkSkeleton() {
  return (
    <div className="rounded-3xl bg-surface card-surface p-6">
      <Skeleton className="mb-2 h-6 w-48 rounded-lg bg-ink/10" />
      <Skeleton className="mb-5 h-4 w-full rounded-lg bg-ink/10" />
      <div className="flex gap-2">
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-32 rounded-full" />
      </div>
    </div>
  );
}
