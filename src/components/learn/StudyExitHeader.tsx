import { Button } from '../ui/Button';
import { CloseIcon } from '../ui/icons';
import { STUDY_HEADER_ROW } from './studyHeaderLayout';

export function StudyExitHeader({ onExit }: { onExit: () => void }) {
  return (
    <header className="bg-paper pt-[env(safe-area-inset-top)]">
      <div className={STUDY_HEADER_ROW}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onExit}
          className="h-11 shrink-0 px-4 max-md:w-11 max-md:px-0"
        >
          <CloseIcon width={16} height={16} aria-hidden="true" />
          <span className="max-md:sr-only">Exit</span>
        </Button>
      </div>
    </header>
  );
}
