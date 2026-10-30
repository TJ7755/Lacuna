import { forwardRef } from 'react';
import {
  NavigationGuard,
  type NavigationGuardHandle,
  type NavigationGuardProps,
} from '../ui/NavigationGuard';

interface SessionExitGuardProps extends Pick<
  NavigationGuardProps,
  'active' | 'onAttempt' | 'onConfirm' | 'onExplicitLeave' | 'onOpenChange'
> {
  itemName: 'Card' | 'Question';
  answeredCount: number;
  totalCount: number;
  /** The remaining card queue is saved on leaving (Simple Learn). */
  resumable?: boolean;
}

export const SessionExitGuard = forwardRef<NavigationGuardHandle, SessionExitGuardProps>(
  function SessionExitGuard(
    { itemName, answeredCount, totalCount, resumable, ...guardProps },
    ref,
  ) {
    const itemLabel = totalCount === 1 ? itemName : `${itemName}s`;
    const consequence = resumable
      ? 'Your recorded answers are safe. You can continue studying when you return, but lesson notes may appear again.'
      : `Your recorded answers are safe, but ${
          itemName === 'Question'
            ? 'the current Question will be abandoned.'
            : 'this session will end. Lesson notes may appear again when you return.'
        }`;
    return (
      <NavigationGuard
        ref={ref}
        {...guardProps}
        title="Leave this session?"
        message={`${answeredCount} of ${totalCount} ${itemLabel} answered. ${consequence}`}
        stayLabel="Stay"
        leaveLabel="Leave"
      />
    );
  },
);
