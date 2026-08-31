import type { Blocker } from '@remix-run/router';
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
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
  onAttempt?: () => void;
  onConfirm?: () => unknown | Promise<unknown>;
  onExplicitLeave?: () => unknown | Promise<unknown>;
}

export interface NavigationGuardHandle {
  requestLeave: () => void;
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
    activeRef.current = props.active;
    onAttemptRef.current = props.onAttempt;
    const blocker = useBlocker(
      useCallback(() => {
        if (!resolveActive(activeRef.current)) return false;
        onAttemptRef.current?.();
        return true;
      }, []),
    );
    return <NavigationGuardCore ref={ref} {...props} blocker={blocker} />;
  },
);

interface NavigationGuardCoreProps extends NavigationGuardProps {
  blocker?: Blocker;
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
      blocker,
    },
    ref,
  ) {
    const activeRef = useRef(active);
    const onAttemptRef = useRef(onAttempt);
    const onConfirmRef = useRef(onConfirm);
    const onExplicitLeaveRef = useRef(onExplicitLeave);
    activeRef.current = active;
    onAttemptRef.current = onAttempt;
    onConfirmRef.current = onConfirm;
    onExplicitLeaveRef.current = onExplicitLeave;
    const [confirming, setConfirming] = useState(false);
    const [explicitAttempt, setExplicitAttempt] = useState(false);
    const blocked = blocker?.state === 'blocked' || explicitAttempt;
    const trapRef = useFocusTrap(blocked, { autoFocusSelector: '[data-guard-stay]' });
    const id = useId();
    const titleId = `navigation-guard-title-${id}`;
    const messageId = `navigation-guard-message-${id}`;

    useImperativeHandle(
      ref,
      () => ({
        requestLeave() {
          if (!resolveActive(activeRef.current)) {
            void onExplicitLeaveRef.current?.();
            return;
          }
          onAttemptRef.current?.();
          setExplicitAttempt(true);
        },
      }),
      [],
    );

    useEffect(() => {
      const handleBeforeUnload = (event: BeforeUnloadEvent) => {
        if (!resolveActive(activeRef.current)) return;
        onAttemptRef.current?.();
        event.preventDefault();
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const stay = () => {
      if (blocker?.state === 'blocked') blocker.reset();
      setExplicitAttempt(false);
      setConfirming(false);
    };

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
        if (blocker?.state === 'blocked') blocker.reset();
        setExplicitAttempt(false);
      } finally {
        setConfirming(false);
      }
    };

    if (!blocked) return null;

    return (
      <div
        ref={trapRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5 backdrop-blur-sm"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && !confirming) {
            event.preventDefault();
            stay();
          }
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={messageId}
          className="w-full max-w-md rounded-3xl border border-line-strong bg-paper p-6 shadow-2xl shadow-black/20"
        >
          <h2 id={titleId} className="font-display text-2xl text-ink">
            {title}
          </h2>
          <p id={messageId} className="mt-2 text-sm leading-6 text-ink-soft">
            {message}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button data-guard-stay="" type="button" onClick={stay} disabled={confirming}>
              {stayLabel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void leave()}
              disabled={confirming}
            >
              {confirming ? 'Leaving…' : leaveLabel}
            </Button>
          </div>
        </section>
      </div>
    );
  },
);
