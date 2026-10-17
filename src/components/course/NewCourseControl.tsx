import { ExpandingCreateControl } from '../ui/ExpandingCreateControl';
import { NewCourseForm } from './NewCourseForm';

export function NewCourseControl({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ExpandingCreateControl label="New course" open={open} onOpenChange={onOpenChange}>
      {(close) => <NewCourseForm inline onClose={close} />}
    </ExpandingCreateControl>
  );
}
