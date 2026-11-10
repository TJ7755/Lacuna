import { useRef } from 'react';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { CloseIcon } from '../ui/icons';

export function StudyExitButton({
  onExit,
  compact = false,
}: {
  onExit: (anchor: HTMLDivElement) => void;
  compact?: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <div ref={anchor} className="relative shrink-0">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          if (anchor.current) onExit(anchor.current);
        }}
        className={cn('h-11 px-4', compact && 'max-md:w-11 max-md:px-0')}
      >
        <CloseIcon width={16} height={16} aria-hidden="true" />
        <span className={compact ? 'max-md:sr-only' : undefined}>Exit</span>
      </Button>
    </div>
  );
}
