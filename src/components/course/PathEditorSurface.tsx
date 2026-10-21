import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring } from '../ui/motion';
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
  cancellable = false,
  children,
}: {
  label: string;
  onSave: () => boolean | Promise<boolean>;
  onClosed: () => void;
  onDelete?: () => Promise<boolean>;
  deleteNoun?: string;
  cancellable?: boolean;
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
  const [origin] = useState(
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
  const content = useRef<HTMLDivElement>(null);
  const trap = useFocusTrap(!closing, {
    autoFocusSelector: '[data-path-editor-focus]',
    returnFocus: false,
  });
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const [bounds, setBounds] = useState({
    left: origin.left,
    top: origin.top,
    width: origin.width,
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
      body.style.width = `${width}px`;
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

  const collapsed = {
    left: origin.left,
    top: origin.top,
    width: origin.width,
    height: origin.height,
    borderRadius: origin.height / 2,
  };

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

  function dismiss() {
    if (pending.current || closing) return;
    if (cancellable) setClosing(true);
    else void finish();
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
        if (event.key === 'Escape') {
          event.preventDefault();
          dismiss();
        } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
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
        onClick={dismiss}
      />
      <motion.div
        data-path-editor-surface=""
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="path-editor fixed overflow-hidden bg-surface-raised path-editor-shadow"
        initial={multiplier > 0 ? collapsed : false}
        animate={closing ? collapsed : { ...bounds, borderRadius: 24 }}
        transition={expandingActionSpring(multiplier)}
        onAnimationComplete={() => {
          if (closing) onClosed();
        }}
      >
        <motion.div
          ref={content}
          className="path-editor-content absolute left-0 top-0"
          style={{ width: bounds.width }}
          initial={multiplier > 0 ? { opacity: 0 } : false}
          animate={{ opacity: closing ? 0 : 1 }}
          transition={{ duration: 0.12 * multiplier }}
        >
          {children}
          <footer className="mt-5 flex items-center justify-between gap-3">
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
            <div className="flex items-center gap-3">
              {cancellable && (
                <Button variant="ghost" disabled={busy || closing} onClick={dismiss}>
                  Cancel
                </Button>
              )}
              <Button variant="primary" disabled={busy || closing} onClick={() => void finish()}>
                {busy ? 'Saving…' : 'Done'}
              </Button>
            </div>
          </footer>
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  );
}
