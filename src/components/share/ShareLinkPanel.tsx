import { forwardRef, lazy, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useIsPresent, type HTMLMotionProps } from 'motion/react';
import QRCode from 'react-qr-code';
import { HOSTED_SERVICE_ORIGIN } from '../../ai/session/hostedTransport';
import type { Course } from '../../db/types';
import { formatShareLink } from '../../shareLinks/client';
import { readShareCredentials } from '../../shareLinks/credentials';
import {
  publishShareLink,
  ShareLinkNeedsReplacementError,
  unpublishShareLink,
} from '../../shareLinks/publish';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { formatRelativeTime } from '../../utils/datetime';
import { Button } from '../ui/Button';
import { buttonClassName } from '../ui/buttonStyles';
import { PageLoadingBoundary } from '../ui/PageLoadingBoundary';
import { ConfirmInlineSwap } from '../ui/ConfirmInline';
import { ShareIcon } from '../ui/icons';
import { expandingActionSpring, liquidSpring, scaledSpring } from '../ui/motion';
import { SectionCard } from '../ui/SectionCard';
import { useToast } from '../ui/Toast';
import { CopyButton } from './CopyButton';
import { gapsClassUrl, shareIdForCourse } from './gapsClassUrl';
import { useActionFocus } from '../../hooks/useActionFocus';

type LinkState = { shareId: string; revision: number };
const GapsConnectionExport = lazy(() =>
  import('../../teacher/GapsConnectionExport').then((module) => ({
    default: module.GapsConnectionExport,
  })),
);

const ShareLinkSurface = forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(
  function ShareLinkSurface(props, ref) {
    const present = useIsPresent();
    return <motion.div {...props} ref={ref} inert={!present} aria-hidden={!present || undefined} />;
  },
);

function linkFromCourse(course: Course): LinkState | null {
  const distribution = course.distribution;
  const shareId = shareIdForCourse(course);
  if (!shareId) return null;
  if (!distribution?.shareId) {
    return { shareId, revision: course.distributedCopy!.revision };
  }
  return {
    shareId,
    revision: distribution.shareRevision ?? distribution.revision,
  };
}

/**
 * The default way to share: one stable link per course that carries media and
 * updates in place. Only its course-specific contents reset when switching course.
 */
export function ShareLinkPanel(props: { course: Course; highlight: boolean }) {
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      if (!element.querySelector('[aria-busy="true"], [data-share-pending]')) {
        setHeight(element.getBoundingClientRect().height);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const readiness = new MutationObserver(measure);
    readiness.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-busy'],
    });
    return () => {
      observer.disconnect();
      readiness.disconnect();
    };
  }, []);

  return (
    <SectionCard className="overflow-hidden p-0!">
      <motion.div
        initial={false}
        animate={{ height: height ?? 'auto' }}
        transition={expandingActionSpring(multiplier)}
      >
        <div ref={content} className="p-6">
          <ShareLinkContent key={props.course.id} {...props} />
        </div>
      </motion.div>
    </SectionCard>
  );
}

function ShareLinkContent({ course, highlight }: { course: Course; highlight: boolean }) {
  const { notify } = useToast();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const titleId = useId();
  const [link, setLink] = useState<LinkState | null>(() => linkFromCourse(course));
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Whether this device holds the link's write token; null while it is read.
  const [managed, setManaged] = useState<boolean | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const mounted = useRef(true);
  const copyTimeout = useRef<number | null>(null);
  const actionFocus = useActionFocus();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (copyTimeout.current) window.clearTimeout(copyTimeout.current);
    };
  }, []);

  const storedShareId = course.distribution?.shareId;
  useEffect(() => {
    if (!storedShareId) {
      setManaged(null);
      return;
    }
    let cancelled = false;
    readShareCredentials(storedShareId).then(
      (credentials) => {
        if (!cancelled) setManaged(Boolean(credentials));
      },
      () => {
        if (!cancelled) setManaged(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [storedShareId]);

  // Inside Electron the link must open the hosted web app; on the web a
  // same-origin link keeps preview deployments working.
  const origin =
    window.electronAPI?.isElectron === true ? HOSTED_SERVICE_ORIGIN : window.location.origin;
  const url = link ? formatShareLink(link.shareId, origin) : '';
  const courseRevision = course.distribution?.revision ?? 0;
  const behind =
    link !== null &&
    course.distribution?.shareId === link.shareId &&
    courseRevision > link.revision;

  async function publish(replaceLink = false) {
    actionFocus.remember();
    setBusy(true);
    try {
      const result = replaceLink
        ? await publishShareLink(course.id, { replaceLink: true })
        : await publishShareLink(course.id);
      if (!mounted.current) return;
      const created = link === null || replaceLink;
      setLink({ shareId: result.shareId, revision: result.revision });
      setCopied(false);
      setManaged(true);
      setConfirmingReplace(false);
      notify(
        created ? 'Share link ready.' : `Link updated to revision ${result.revision}.`,
        'positive',
      );
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ShareLinkNeedsReplacementError) {
        setManaged(false);
        notify(error.message, 'negative');
        return;
      }
      notify(error instanceof Error ? error.message : 'Could not create a share link.', 'negative');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function stop() {
    actionFocus.remember();
    setConfirmingStop(false);
    setBusy(true);
    try {
      await unpublishShareLink(course.id);
      if (!mounted.current) return;
      setLink(null);
      setCopied(false);
      notify(
        'Share link removed. Students keep their copies but will not receive updates.',
        'positive',
      );
    } catch (error) {
      if (!mounted.current) return;
      notify(
        error instanceof Error ? error.message : 'Could not remove the share link.',
        'negative',
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimeout.current) window.clearTimeout(copyTimeout.current);
      copyTimeout.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('Copy failed. Select the link and copy it manually.', 'negative');
    }
  }

  const forwarded = link !== null && !course.distribution?.shareId && !!course.distributedCopy;
  const pending = link !== null && !forwarded && managed === null;
  const state = pending
    ? 'pending'
    : forwarded
      ? 'forwarded'
      : managed === false
        ? 'unmanaged'
        : link
          ? 'live'
          : 'none';

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      aria-busy={pending || undefined}
      className="relative overflow-hidden"
    >
      <h2 id={titleId} className="font-display text-2xl tracking-tight">
        Share link
      </h2>
      <AnimatePresence mode="popLayout" initial={false}>
        <ShareLinkSurface
          key={state}
          data-share-pending={pending || undefined}
          initial={m > 0 ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={m > 0 ? { opacity: 0 } : undefined}
          transition={liquidSpring(m)}
        >
          {state === 'none' && (
            <Button
              ref={actionFocus.restore}
              variant="primary"
              size="lg"
              className={
                highlight ? 'mt-4 ring-2 ring-accent ring-offset-4 ring-offset-surface' : 'mt-4'
              }
              onClick={() => void publish()}
              disabled={busy}
            >
              <ShareIcon width={18} height={18} />
              {busy ? 'Creating…' : 'Create share link'}
            </Button>
          )}

          {(state === 'live' || state === 'forwarded' || state === 'unmanaged') && link && (
            <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <input
                    ref={actionFocus.restore}
                    readOnly
                    aria-label="Share link"
                    value={url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-h-11 min-w-0 flex-1 truncate rounded-full bg-paper px-4 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
                  />
                  <CopyButton size="md" copied={copied} onClick={() => void copy()} />
                </div>
                <p className="mt-3 text-sm text-ink-faint">
                  Revision {link.revision}
                  {course.distribution?.shareId === link.shareId && (
                    <> · updated {formatRelativeTime(course.distribution.publishedAt)}</>
                  )}
                </p>
                {state === 'forwarded' && (
                  <p className="mt-3 text-sm text-ink-soft">
                    Pass on this link to keep receiving the publisher’s updates. To use this course
                    with your own class, paste the link into{' '}
                    <a className="underline" href="https://gaps.getlacuna.app">
                      Gaps
                    </a>
                    .
                  </p>
                )}
                {state === 'unmanaged' && (
                  <div className="mt-3 text-sm text-ink-soft">
                    <p>
                      Copy and pass on this link. Updates still come from the device that publishes
                      it.
                    </p>
                    <p className="mt-2">
                      For your own class, paste the link into{' '}
                      <a className="underline" href="https://gaps.getlacuna.app">
                        Gaps
                      </a>
                      .
                    </p>
                    <details className="mt-4">
                      <summary>Link management</summary>
                      <p className="mt-3">
                        Only the original publishing device can update this link. Replacing it
                        creates a separate link that existing recipients will not follow.
                      </p>
                      <div className="mt-3">
                        <ConfirmInlineSwap
                          active={confirmingReplace}
                          onCancel={() => setConfirmingReplace(false)}
                          message="Replace the link? The old link stays live until it expires."
                          confirmLabel="Yes, replace it"
                          onConfirm={() => publish(true)}
                          disabled={busy}
                        >
                          <Button
                            variant="secondary"
                            onClick={() => setConfirmingReplace(true)}
                            disabled={busy}
                          >
                            Replace link
                          </Button>
                        </ConfirmInlineSwap>
                      </div>
                    </details>
                  </div>
                )}
                {state === 'live' && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant={behind ? 'primary' : 'secondary'}
                      onClick={() => void publish()}
                      disabled={busy}
                    >
                      {busy
                        ? 'Updating…'
                        : behind
                          ? `Send revision ${courseRevision}`
                          : 'Update link'}
                    </Button>
                    <ConfirmInlineSwap
                      active={confirmingStop}
                      onCancel={() => setConfirmingStop(false)}
                      message="Stop sharing? Students keep their copies but stop receiving updates."
                      confirmLabel="Stop sharing"
                      onConfirm={stop}
                      disabled={busy}
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingStop(true)}
                        disabled={busy}
                      >
                        Stop sharing
                      </Button>
                    </ConfirmInlineSwap>
                  </div>
                )}
                <div className="mt-4">
                  <a
                    href={gapsClassUrl(link.shareId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClassName('primary')}
                  >
                    Set up a class in Gaps
                  </a>
                </div>
                {state === 'live' && (
                  <div className="mt-4">
                    <PageLoadingBoundary>
                      <GapsConnectionExport
                        key={link.shareId}
                        shareId={link.shareId}
                        courseName={course.name}
                      />
                    </PageLoadingBoundary>
                  </div>
                )}
              </div>
              <motion.div
                initial={m > 0 ? { scale: 0.85, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={scaledSpring(m, 420, 26)}
                className="self-center rounded-2xl bg-white p-3 sm:self-start"
              >
                <QRCode value={url} size={128} level="L" bgColor="#ffffff" fgColor="#000000" />
              </motion.div>
            </div>
          )}
        </ShareLinkSurface>
      </AnimatePresence>
    </div>
  );
}
