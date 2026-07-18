import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';
import { detachCourse, setCourseAutoAcceptUpdates } from '../../db/repository';

export interface DetachCourseSectionProps {
  courseId: string;
  autoAcceptUpdates: boolean;
}

/**
 * Settings for a locked distributed copy (Arc 7 §7.1, §7.9 Task 8). Rendered only when
 * the course is a still-locked distributed copy (see CourseSettings.tsx), which is the
 * only state this section is ever visible in — once detached, `distributedCopy` is gone
 * and the section stops rendering. Combines the auto-accept preference and the detach
 * escape hatch into one "this course is shared" block rather than two fragments, since
 * both concern the same relationship to the teacher's lineage.
 *
 * The auto-accept toggle commits instantly, like its settings-page siblings — it is not
 * staged behind CourseSettings' Save button. Detach is consequential (it stops future
 * teacher updates from merging) but not destructive of any content, so its trigger stays
 * a secondary button; only the confirm step borrows the destructive framing, per §7.1.
 */
export function DetachCourseSection({ courseId, autoAcceptUpdates }: DetachCourseSectionProps) {
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);

  async function handleDetach() {
    await detachCourse(courseId);
    notify('Course detached. You can now edit it freely.', 'neutral');
    setConfirming(false);
  }

  async function handleAutoAcceptChange(checked: boolean) {
    await setCourseAutoAcceptUpdates(courseId, checked);
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]">
      <h2 className="mb-1 font-display text-xl">Shared course</h2>
      <p className="mb-4 text-sm text-ink-soft">
        This course is managed by its author. Detach it to edit freely — future updates
        from them will arrive as a separate course instead of merging.
      </p>
      <div className="mb-4 flex items-start justify-between gap-3 border-t border-line pt-4">
        <div className="min-w-0">
          <label htmlFor="auto-accept-updates" className="text-sm">
            Apply updates automatically
          </label>
          <p className="mt-1 text-sm text-ink-soft">
            New changes from the course author are applied without review. You can still
            see what changed afterwards.
          </p>
        </div>
        <Toggle
          id="auto-accept-updates"
          checked={autoAcceptUpdates}
          onChange={(checked) => void handleAutoAcceptChange(checked)}
        />
      </div>
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
