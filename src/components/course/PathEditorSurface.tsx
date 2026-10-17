import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useMorphReveal } from '../ui/useMorphReveal';
import { MorphContent } from '../ui/MorphContent';
import type { MorphRect } from '../ui/morphReveal';
import { Button } from '../ui/Button';
import { PathEditorPopover } from './PathEditorPopover';
import './path-editor.css';

/** Menus restore their trigger before opening an editor; use its containing path row. */
export function pathEditorSource(): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  return (
    active
      .closest<HTMLElement>('[data-path-source]')
      ?.querySelector<HTMLElement>('[data-path-row]') ?? active
  );
}

export function PathEditorSurface({
  label,
  onSave,
  onClosed,
  onDelete,
  deleteNoun,
  children,
}: {
  label: string;
  onSave: () => boolean | Promise<boolean>;
  onClosed: () => void;
  onDelete?: () => Promise<boolean>;
  deleteNoun?: string;
  children: ReactNode;
}) {
  const [source] = useState(pathEditorSource);
  const [neighbour] = useState(() => {
    const row = source?.closest('li');
    return (
      row?.nextElementSibling?.querySelector<HTMLElement>('[data-path-row], button') ??
      row?.previousElementSibling?.querySelector<HTMLElement>('[data-path-row], button') ??
      null
    );
  });
  const [origin] = useState<MorphRect>(
    () =>
      (source?.closest('[data-path-source]') ?? source)?.getBoundingClientRect() ?? {
        left: 24,
        top: 140,
        width: 160,
        height: 48,
      },
  );
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const depth = useRef<HTMLDivElement>(null);
  const trap = useFocusTrap(!closing, {
    autoFocusSelector: '[data-path-editor-focus]',
    returnFocus: false,
  });
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const [bounds, setBounds] = useState<MorphRect>({
    left: origin.left,
    top: origin.top,
    width: Math.min(680, window.innerWidth - 32),
    height: origin.height,
  });

  useLayoutEffect(() => {
    const body = content.current;
    if (!body) return;
    const measure = () => {
      const narrow = window.innerWidth < 640;
      const card = source?.closest('[data-path-card]')?.getBoundingClientRect();
      const width = narrow
        ? window.innerWidth - 16
        : Math.min(Math.max(card?.width ?? origin.width, 520), 760, window.innerWidth - 32);
      if (surface.current) surface.current.style.width = `${width}px`;
      const height = Math.min(body.scrollHeight, window.innerHeight - 32);
      const left = narrow
        ? 8
        : Math.max(16, Math.min(card?.left ?? origin.left, window.innerWidth - width - 16));
      const top = narrow
        ? window.innerHeight - height - 8
        : Math.max(16, Math.min(origin.top - 8, window.innerHeight - height - 16));
      setBounds((old) =>
        old.left === left && old.top === top && old.width === width && old.height === height
          ? old
          : { left, top, width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [origin, source]);

  useMorphReveal({
    surface,
    content,
    depth,
    origin,
    bounds,
    open: !closing,
    multiplier,
    onComplete: () => {
      if (closing) onClosed();
    },
  });

  useLayoutEffect(() => {
    const host = trap.current;
    if (!host) return;
    host.querySelector<HTMLElement>('[data-path-editor-focus]')?.focus({ preventScroll: true });
    const background = [...document.body.children].filter(
      (node): node is HTMLElement => node instanceof HTMLElement && !node.contains(host),
    );
    const previous = background.map((node) => ({
      node,
      inert: node.inert,
      hidden: node.getAttribute('aria-hidden'),
    }));
    for (const { node } of previous) {
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
    }
    const visibility = source?.style.visibility;
    if (source) source.style.visibility = 'hidden';
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      for (const { node, inert, hidden } of previous) {
        node.inert = inert;
        if (hidden === null) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', hidden);
      }
      document.body.style.overflow = overflow;
      if (source) {
        source.style.visibility = visibility ?? '';
        const target = source.isConnected
          ? source
          : neighbour?.isConnected
            ? neighbour
            : document.querySelector<HTMLElement>('#course-path-heading');
        if (target && !target.matches('button, input, [tabindex]')) target.tabIndex = -1;
        target?.focus({ preventScroll: true });
      }
    };
  }, [source, neighbour, trap]);

  async function finish(remove = false) {
    if (pending.current || closing) return;
    pending.current = true;
    setBusy(true);
    try {
      const valid = remove ? await onDelete?.() : await onSave();
      if (valid) setClosing(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div
      ref={trap}
      data-path-editor-host=""
      className="fixed inset-0 z-50"
      inert={closing}
      aria-hidden={closing || undefined}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key === 'Enter')) {
          event.preventDefault();
          void finish();
        }
      }}
    >
      <motion.div
        data-path-editor-backdrop=""
        aria-hidden="true"
        className="absolute inset-0 bg-paper/35"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.18 * multiplier }}
        onClick={() => void finish()}
      />
      <div
        ref={depth}
        aria-hidden="true"
        className="pointer-events-none fixed rounded-3xl path-editor-shadow"
        style={{ ...bounds, opacity: 0 }}
      />
      <div
        ref={surface}
        data-path-editor-surface=""
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="path-editor fixed bg-surface-raised"
        style={{ ...bounds }}
      >
        <MorphContent ref={content} multiplier={multiplier} className="path-editor-content">
          {children}
          <footer data-morph-row className="mt-5 flex items-center justify-between gap-3">
            {onDelete ? (
              <PathEditorPopover label="Delete" quiet negative>
                <p className="px-3 py-2 text-sm">Delete this {deleteNoun}?</p>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => void finish(true)}
                >
                  Delete
                </Button>
              </PathEditorPopover>
            ) : (
              <span />
            )}
            <Button variant="primary" disabled={busy || closing} onClick={() => void finish()}>
              {busy ? 'Saving…' : 'Done'}
            </Button>
          </footer>
        </MorphContent>
      </div>
    </div>,
    document.body,
  );
}
