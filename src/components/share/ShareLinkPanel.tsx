import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
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
import { ConfirmInlineSwap } from '../ui/ConfirmInline';
import { ShareIcon } from '../ui/icons';
import { motionTransition, scaledSpring } from '../ui/motion';
import { SectionCard } from '../ui/SectionCard';
import { useToast } from '../ui/Toast';
import { CopyButton } from './CopyButton';

type LinkState = { shareId: string; revision: number };

function linkFromCourse(course: Course): LinkState | null {
  const distribution = course.distribution;
  if (!distribution?.shareId) return null;
  return {
    shareId: distribution.shareId,
    revision: distribution.shareRevision ?? distribution.revision,
  };
}

/**
 * The default way to share: one stable link per course that carries media and
 * updates in place. Keyed by course, so switching course starts afresh.
 */
export function ShareLinkPanel({ course, highlight }: { course: Course; highlight: boolean }) {
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

  useEffect(
    () => () => {
      mounted.current = false;
      if (copyTimeout.current) window.clearTimeout(copyTimeout.current);
    },
    [],
  );

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

  const state = managed === false ? 'unmanaged' : link ? 'live' : 'none';

  return (
    <SectionCard aria-labelledby={titleId} className="overflow-hidden">
      <h2 id={titleId} className="font-display text-2xl tracking-tight">
        Share link
      </h2>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state}
          initial={m > 0 ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={m > 0 ? { opacity: 0, y: -6 } : undefined}
          transition={motionTransition('local', m)}
        >
          {state === 'unmanaged' && (
            <div className="mt-3">
              <p className="text-sm text-ink-soft">
                This link was created on another device, so it can&apos;t be updated here.
              </p>
              <div className="mt-4">
                <ConfirmInlineSwap
                  active={confirmingReplace}
                  onCancel={() => setConfirmingReplace(false)}
                  message="Replace the link? The old link stays live until it expires."
                  confirmLabel="Yes, replace it"
                  onConfirm={() => void publish(true)}
                >
                  <Button
                    variant="primary"
                    onClick={() => setConfirmingReplace(true)}
                    disabled={busy}
                  >
                    Replace link
                  </Button>
                </ConfirmInlineSwap>
              </div>
            </div>
          )}

          {state === 'none' && (
            <Button
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

          {state === 'live' && link && (
            <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    aria-label="Share link"
                    value={url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-h-11 min-w-0 flex-1 truncate rounded-full bg-paper px-4 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  />
                  <CopyButton size="md" copied={copied} onClick={() => void copy()} />
                </div>
                <p className="mt-3 text-sm text-ink-faint">
                  Revision {link.revision}
                  {course.distribution?.shareId === link.shareId && (
                    <> · updated {formatRelativeTime(course.distribution.publishedAt)}</>
                  )}
                </p>
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
                    message="Stop sharing this link? Students keep their copies but will not receive updates."
                    confirmLabel="Yes, stop sharing"
                    onConfirm={() => void stop()}
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
        </motion.div>
      </AnimatePresence>
    </SectionCard>
  );
}
