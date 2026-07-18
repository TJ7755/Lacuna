import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { useToast } from '../../components/ui/Toast';
import { detachCourse } from '../../db/repository';

export interface DetachCourseSectionProps {
  courseId: string;
}

/**
 * Escape hatch for a locked distributed copy (Arc 7 §7.1): lets a student detach their
 * imported course from the teacher's lineage so they can edit it freely. Rendered only
 * when the course is a still-locked distributed copy (see CourseSettings.tsx), which is
 * the only state this section is ever visible in — once detached, `distributedCopy` is
 * gone and the section stops rendering. Detach is consequential (it stops future teacher
 * updates from merging) but not destructive of any content, so the trigger stays a
 * secondary button; only the confirm step borrows the destructive framing, per §7.1.
 */
export function DetachCourseSection({ courseId }: DetachCourseSectionProps) {
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);

  async function handleDetach() {
    await detachCourse(courseId);
    notify('Course detached. You can now edit it freely.', 'neutral');
    setConfirming(false);
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]">
      <h2 className="mb-1 font-display text-xl">Shared course</h2>
      <p className="mb-4 text-sm text-ink-soft">
        This course is managed by its author. Detach it to edit freely — future updates
        from them will arrive as a separate course instead of merging.
      </p>
      {confirming ? (
        <ConfirmInline
          message="Detach this course?"
          confirmLabel="Detach"
          variant="destructive"
          onConfirm={() => void handleDetach()}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          Detach course
        </Button>
      )}
    </section>
  );
}
