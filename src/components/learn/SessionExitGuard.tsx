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
}

export const SessionExitGuard = forwardRef<NavigationGuardHandle, SessionExitGuardProps>(
  function SessionExitGuard({ itemName, answeredCount, totalCount, ...guardProps }, ref) {
    const itemLabel = totalCount === 1 ? itemName : `${itemName}s`;
    const consequence =
      itemName === 'Question'
        ? 'the current Question will be abandoned.'
        : 'this session will end.';
    return (
      <NavigationGuard
        ref={ref}
        {...guardProps}
        title="Leave this session?"
        message={`${answeredCount} of ${totalCount} ${itemLabel} answered. Your recorded answers are safe, but ${consequence}`}
        stayLabel="Stay"
        leaveLabel="Leave"
      />
    );
  },
);
