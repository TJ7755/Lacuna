import { forwardRef } from 'react';
import {
  NavigationGuard,
  type NavigationGuardHandle,
  type NavigationGuardProps,
} from '../ui/NavigationGuard';

interface SessionExitGuardProps extends Pick<
  NavigationGuardProps,
  'active' | 'onAttempt' | 'onConfirm' | 'onExplicitLeave'
> {
  itemName: 'Card' | 'Question';
  answeredCount: number;
  totalCount: number;
  /** The session is saved on leaving and resumes next time (Simple Learn). */
  resumable?: boolean;
}

export const SessionExitGuard = forwardRef<NavigationGuardHandle, SessionExitGuardProps>(
  function SessionExitGuard({ itemName, answeredCount, totalCount, resumable, ...guardProps }, ref) {
    const itemLabel = totalCount === 1 ? itemName : `${itemName}s`;
    const consequence = resumable
      ? 'Your progress is saved, so you can pick up where you left off.'
      : `Your recorded answers are safe, but ${
        itemName === 'Question' ? 'the current Question will be abandoned.' : 'this session will end.'
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
