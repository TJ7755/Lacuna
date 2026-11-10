import { AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { DialogPanel } from './DialogPanel';
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from './Button';

export interface NavigationGuardProps {
  active: boolean | (() => boolean);
  title: string;
  message: string;
  stayLabel?: string;
  leaveLabel?: string;
  onAttempt?: (source: 'navigation' | 'unload') => void;
  onConfirm?: () => unknown | Promise<unknown>;
  onExplicitLeave?: () => unknown | Promise<unknown>;
  onOpenChange?: (open: boolean, anchored: boolean) => void;
}

export interface NavigationGuardHandle {
  requestLeave: (anchor?: HTMLElement) => void;
}

function resolveActive(active: NavigationGuardProps['active']): boolean {
  return typeof active === 'function' ? active() : active;
}

/**
 * Guards data-router navigation, browser unloads and imperative flow exits. Under a
 * declarative router only the latter two are available; useBlocker itself throws there.
 */
export const NavigationGuard = forwardRef<NavigationGuardHandle, NavigationGuardProps>(
  function NavigationGuard(props, ref) {
    const dataRouter = useContext(UNSAFE_DataRouterContext);
    return dataRouter ? (
      <DataRouterNavigationGuard ref={ref} {...props} />
    ) : (
      <NavigationGuardCore ref={ref} {...props} />
    );
  },
);

const DataRouterNavigationGuard = forwardRef<NavigationGuardHandle, NavigationGuardProps>(
  function DataRouterNavigationGuard(props, ref) {
    const activeRef = useRef(props.active);
    const onAttemptRef = useRef(props.onAttempt);
    useLayoutEffect(() => {
      activeRef.current = props.active;
      onAttemptRef.current = props.onAttempt;
    }, [props.active, props.onAttempt]);
    const blocker = useBlocker(
      useCallback(() => {
        if (!resolveActive(activeRef.current)) return false;
        onAttemptRef.current?.('navigation');
        return true;
      }, []),
    );
    return <NavigationGuardCore ref={ref} {...props} blocker={blocker} />;
  },
);

interface NavigationGuardCoreProps extends NavigationGuardProps {
  blocker?: ReturnType<typeof useBlocker>;
}

const NavigationGuardCore = forwardRef<NavigationGuardHandle, NavigationGuardCoreProps>(
  function NavigationGuardCore(
    {
      active,
      title,
      message,
      stayLabel = 'Keep editing',
      leaveLabel = 'Leave',
      onAttempt,
      onConfirm,
      onExplicitLeave,
      onOpenChange,
      blocker,
    },
    ref,
  ) {
    const activeRef = useRef(active);
    const onAttemptRef = useRef(onAttempt);
    const onConfirmRef = useRef(onConfirm);
    const onExplicitLeaveRef = useRef(onExplicitLeave);
    useLayoutEffect(() => {
      activeRef.current = active;
      onAttemptRef.current = onAttempt;
      onConfirmRef.current = onConfirm;
      onExplicitLeaveRef.current = onExplicitLeave;
    }, [active, onAttempt, onConfirm, onExplicitLeave]);
    const [confirming, setConfirming] = useState(false);
    const [explicitAttempt, setExplicitAttempt] = useState(false);
    const [anchor, setAnchor] = useState<HTMLElement>();
    const blocked = blocker?.state === 'blocked' || explicitAttempt;
    const anchored = explicitAttempt && Boolean(anchor?.isConnected);
    useEffect(() => {
      onOpenChange?.(blocked, anchored);
    }, [anchored, blocked, onOpenChange]);
    const trapRef = useFocusTrap(blocked, {
      autoFocusSelector: '[data-guard-stay]',
      returnFocus: !anchored,
    });
    const messageId = useId();

    useEffect(() => {
      const handleBeforeUnload = (event: BeforeUnloadEvent) => {
        if (!resolveActive(activeRef.current)) return;
        onAttemptRef.current?.('unload');
        event.preventDefault();
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const stay = useCallback(() => {
      if (blocker?.state === 'blocked') blocker.reset();
      setExplicitAttempt(false);
      setConfirming(false);
    }, [blocker]);

    const cancel = useCallback(() => {
      stay();
      if (anchored) anchor?.querySelector('button')?.focus({ preventScroll: true });
    }, [anchor, anchored, stay]);

    useImperativeHandle(
      ref,
      () => ({
        requestLeave(triggerAnchor) {
          if (blocked) {
            if (anchored && triggerAnchor === anchor && !confirming) cancel();
            return;
          }
          if (!resolveActive(activeRef.current)) {
            void onExplicitLeaveRef.current?.();
            return;
          }
          onAttemptRef.current?.('navigation');
          setAnchor(triggerAnchor);
          setExplicitAttempt(true);
        },
      }),
      [anchor, anchored, blocked, cancel, confirming],
    );

    useEffect(() => {
      if (!anchored) return;
      const dismiss = (event: PointerEvent) => {
        if (!confirming && event.target instanceof Node && !anchor?.contains(event.target))
          cancel();
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (!confirming) cancel();
      };
      document.addEventListener('pointerdown', dismiss);
      document.addEventListener('keydown', escape, true);
      return () => {
        document.removeEventListener('pointerdown', dismiss);
        document.removeEventListener('keydown', escape, true);
      };
    }, [anchor, anchored, cancel, confirming]);

    const leave = async () => {
      if (!blocked || confirming) return;
      setConfirming(true);
      try {
        await onConfirmRef.current?.();
        if (blocker?.state === 'blocked') {
          blocker.proceed();
        } else {
          await onExplicitLeaveRef.current?.();
          setExplicitAttempt(false);
        }
      } catch {
        cancel();
      } finally {
        setConfirming(false);
      }
    };

    const confirmation = (modal: boolean) => (
      <DialogPanel
        modal={modal}
        belowTrigger={!modal}
        label={title}
        describedBy={messageId}
        trapRef={trapRef}
        className={
          modal
            ? 'max-w-md overflow-y-auto p-6'
            : 'absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-4rem))] p-4'
        }
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && !confirming) {
            event.preventDefault();
            cancel();
          }
        }}
      >
        <h2 className="font-display text-xl text-ink">{title}</h2>
        <p id={messageId} className="mt-2 text-sm leading-6 text-ink-soft">
          {message}
        </p>
        <div
          className={
            modal
              ? 'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'
              : 'mt-4 flex flex-wrap justify-end gap-2'
          }
        >
          <Button data-guard-stay="" type="button" onClick={cancel} disabled={confirming}>
            {stayLabel}
          </Button>
          <Button type="button" variant="danger" onClick={() => void leave()} disabled={confirming}>
            {confirming ? 'Leaving…' : leaveLabel}
          </Button>
        </div>
      </DialogPanel>
    );

    return (
      <>
        <AnimatePresence>{blocked && !anchored && confirmation(true)}</AnimatePresence>
        {anchor &&
          createPortal(
            <AnimatePresence>{blocked && anchored && confirmation(false)}</AnimatePresence>,
            anchor,
          )}
      </>
    );
  },
);
