import { ExpandingCreateControl } from '../ui/ExpandingCreateControl';
import { NewCourseForm } from './NewCourseForm';

export function NewCourseControl({
  open,
  onOpenChange,
  prominent = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prominent?: boolean;
}) {
  return (
    <ExpandingCreateControl
      label="New course"
      open={open}
      onOpenChange={onOpenChange}
      prominent={prominent}
      align={prominent ? 'centre' : 'end'}
    >
      {(close) => <NewCourseForm inline onClose={close} />}
    </ExpandingCreateControl>
  );
}
