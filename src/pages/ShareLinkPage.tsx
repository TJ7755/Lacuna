import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { StepSwap } from '../components/ui/StepSwap';
import { buttonClassName } from '../components/ui/buttonStyles';
import { Skeleton } from '../components/ui/Skeleton';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import { SharedCourseImport } from '../components/import/SharedCourseImport';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { Button } from '../components/ui/Button';
import {
  DEFAULT_RELAY_URL,
  getShareBytes,
  parseShareCode,
  parseShareManifest,
} from '../shareLinks/client';
import { confirmShareImport } from '../shareLinks/linkStore';

type ShareLinkState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'incomplete'; message: string }
  | { status: 'ready'; file: File; shareId: string; expectedLineageId: string };

const UNAVAILABLE_MESSAGE =
  'This link is invalid or has been removed. Ask the teacher for a fresh link.';

const INCOMPLETE_MESSAGE =
  'The link loaded, but its update details are missing. Check your connection, then try again — importing now would miss future teacher updates.';

/**
 * Student entry point for teacher share links (`/#/s/<code>`). The published
 * course file is fetched from the relay, then handed to the shared-course
 * importer. `SharedCourseImport` is imported statically so this route chunk
 * carries course-file support for offline first use.
 */
export function ShareLinkPage() {
  const { code } = useParams();
  const [state, setState] = useState<ShareLinkState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      let shareId: string;
      try {
        shareId = parseShareCode(code ?? '');
      } catch {
        if (!cancelled) setState({ status: 'unavailable', message: UNAVAILABLE_MESSAGE });
        return;
      }
      try {
        const result = await getShareBytes({
          relayUrl: DEFAULT_RELAY_URL,
          shareId,
          slot: 'payload',
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
        setState({
          status: 'ready',
          shareId,
          expectedLineageId,
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
    };
  }, [code, attempt]);

  return (
    <div className={`${PAGE_FRAME} pb-10`}>
      <header className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Shared course</h1>
      </header>
      <StepSwap stepKey={state.status}>
        {state.status === 'loading' ? (
          <DelayedFallback>
            <ShareLinkSkeleton />
          </DelayedFallback>
        ) : state.status === 'unavailable' ? (
          <section className="rounded-3xl bg-surface card-surface p-6">
            <h2 className="mb-1 font-display text-xl">This link is unavailable</h2>
            <p className="mb-5 text-sm text-ink-soft">{state.message}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
                Try again
              </Button>
              <Link to="/share" className={buttonClassName('ghost', 'sm')}>
                Back to Share
              </Link>
            </div>
          </section>
        ) : state.status === 'ready' ? (
          <SharedCourseImport
            initialFile={state.file}
            onImported={(courseId) => {
              void confirmShareImport(state.shareId, state.expectedLineageId, courseId);
            }}
          />
        ) : (
          <section className="rounded-3xl bg-surface card-surface p-6">
            <h2 className="mb-1 font-display text-xl">This link is incomplete</h2>
            <p className="mb-5 text-sm text-ink-soft">{state.message}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
                Try again
              </Button>
              <Link to="/share" className={buttonClassName('ghost', 'sm')}>
                Back to Share
              </Link>
            </div>
          </section>
        )}
      </StepSwap>
    </div>
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
