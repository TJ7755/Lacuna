import { ExpandingCreateControl } from '../ui/ExpandingCreateControl';
import { NewCourseForm } from './NewCourseForm';

export function NewCourseControl({
  prominent = false,
  open,
  onOpenChange,
}: {
  prominent?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ExpandingCreateControl
      prominent={prominent}
      label="New course"
      open={open}
      onOpenChange={onOpenChange}
    >
      {(close) => <NewCourseForm inline onClose={close} />}
    </ExpandingCreateControl>
  );
}
