import { AnimatePresence } from 'motion/react';
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
    useLayoutEffect(() => {
      activeRef.current = props.active;
      onAttemptRef.current = props.onAttempt;
    }, [props.active, props.onAttempt]);
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
    const blocked = blocker?.state === 'blocked' || explicitAttempt;
    const trapRef = useFocusTrap(blocked, { autoFocusSelector: '[data-guard-stay]' });
    const messageId = useId();

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

    return (
      <AnimatePresence>
        {blocked && (
          <DialogPanel
            label={title}
            describedBy={messageId}
            trapRef={trapRef}
            className="max-w-md overflow-y-auto p-6"
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape' && !confirming) {
                event.preventDefault();
                stay();
              }
            }}
          >
            <h2 className="font-display text-xl text-ink">{title}</h2>
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
          </DialogPanel>
        )}
      </AnimatePresence>
    );
  },
);
